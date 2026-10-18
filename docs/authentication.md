# Authentication and authorization

How signing in, sessions and permissions work, end to end. The original
design and its trade-offs are in
[superpowers/specs/2026-10-01-auth-design.md](superpowers/specs/2026-10-01-auth-design.md);
this page describes the code as it is. Known weaknesses are tracked in
[audits/2026-10-17-auth-audit.md](audits/2026-10-17-auth-audit.md).

Self-built, email + password, server-side sessions in Postgres. No JWT, no
OAuth, no third-party auth library.

## Where the code lives

| Concern | File |
| --- | --- |
| Session cookie: name, flags, set/clear | `apps/api/src/lib/session-cookie.ts` |
| Token generation and hashing (sha256) | `apps/api/src/lib/crypto.ts` |
| Password hashing (argon2id), dummy hash | `apps/api/src/lib/password.ts` |
| Cookie → `request.user` on every request; `requireAuth`, `requireRole`, `currentUser` | `apps/api/src/plugins/session.ts` |
| Origin check (CSRF), `trustProxy` | `apps/api/src/app.ts` |
| `WEB_ORIGIN`, `COOKIE_SECURE`, `TRUSTED_PROXY`, `IS_DEV_OR_TEST` | `apps/api/src/lib/config.ts` |
| Rate limits | `apps/api/src/lib/rate-limits.ts` |
| Auth endpoints / business rules / DB access | `apps/api/src/modules/auth/auth.{routes,service,repository}.ts` |
| Profile, password change, account deletion | `apps/api/src/modules/users/user.{routes,service,repository}.ts` |
| Event permissions (`canModify`) | `apps/api/src/modules/events/event.service.ts` |
| Input schemas (email, password rules, tokens) | `packages/contracts/src/index.ts` |
| Tables `User`, `Session`, `AuthToken` | `packages/db/prisma/schema.prisma` |
| Server-side API calls carrying the visitor's cookie; cookie relay | `apps/web/app/shared/api/request.server.ts`, `apps/web/app/shared/api/session-cookie.ts` |
| `getMe()`, `meQuery`, `safeNext`, `canModifyEvent` | `apps/web/app/modules/auth/{model/session.server,model/queries,lib/session}.ts` |
| Auth and account Server Actions | `apps/web/app/modules/{auth/auth,account/account}.actions.ts`, `apps/web/app/shared/api/server-action.ts` |

## Data model

```
User ─┬─< Session    one row per signed-in browser
      ├─< AuthToken  one-shot links: PASSWORD_RESET, EMAIL_VERIFY
      └─< Event      organizerId (nullable, SET NULL on user delete)
```

- **`User`**: `email` is unique and always stored trimmed and lowercased
  (`normalizeEmail` in the service, and the `email` schema in contracts).
  `passwordHash` is argon2id. `role` is `USER` (default) or `ADMIN`.
  `emailVerifiedAt` is null until the email is confirmed.
- **`Session`**: `tokenHash` (sha256 of the cookie value, unique),
  `expiresAt`, plus `userAgent` and `ip` for a future "your devices" list.
  Deleting a user cascades to sessions.
- **`AuthToken`**: `tokenHash`, `type`, `expiresAt`, `usedAt`. Cascades on
  user delete.

The raw session token and the raw link tokens exist only in the cookie and in
the email. The database holds only hashes, so a database leak does not hand
out working sessions or links.

`publicUserSelect` (`user.repository.ts`) is the only shape the API reads
users with; `passwordHash` is selected only by `findCredentialsByEmail/ById`.
`request.user` and every API response carry this `PublicUser`.

## The session

### The cookie

`sid`, set by the API (`setSessionCookie`):

| Attribute | Value | Why |
| --- | --- | --- |
| value | 32 random bytes, base64url | unguessable; not signed, the server looks it up anyway |
| `HttpOnly` | yes | page scripts can't read it |
| `SameSite` | `Lax` | not sent on cross-site POST/PATCH/DELETE |
| `Secure` | when `WEB_ORIGIN` is `https:` | derived from the origin, not `NODE_ENV`, so a forgotten `NODE_ENV` can't drop it |
| `Path` | `/` | |
| `Domain` | not set | bound to the exact public host |
| `Expires` | session `expiresAt` | |

The browser only ever talks to the web origin (dev: Next rewrites `/api/*` to
Fastify; production: nginx routes `/api/*` to Fastify). So the cookie belongs
to the web host, and the Next server receives it on page requests too.

### Lifetime

- Created with a 30-day lifetime (`SESSION_TTL_MS`).
- **Sliding renewal**: when a request arrives and more than a day has passed
  since the expiry was last set (`RENEW_AFTER_MS`), `resolveSession` moves
  `expiresAt` to now + 30 days and the plugin re-sends the cookie. At most one
  DB write per user per day.
- An expired session presented by a browser is deleted and the cookie cleared.
  Expired rows that are never presented again stay in the table (no cleanup
  job).

### Resolving it on every request

`sessionPlugin` (`plugins/session.ts`) is an `onRequest` hook on the root
instance (wrapped in `fastify-plugin`, so it applies to every route module):

```
cookie sid? ── no ──▶ request.user = null
   │ yes
sha256(sid) → Session (+ PublicUser) ── not found / expired ──▶ clear cookie, user = null
   │ found
request.user = PublicUser, request.sessionId = Session.id
renew if due → Set-Cookie with the new Expires
```

The user, including `role`, is read from the database on every request, so a
role change or a deleted account takes effect immediately.

### Ending it

| Action | Endpoint | Effect |
| --- | --- | --- |
| Sign out | `POST /api/auth/logout` | deletes this session (no-op if none), clears the cookie |
| Sign out everywhere | `POST /api/auth/logout-all` | deletes every session of the user, clears the cookie |
| Change password | `POST /api/auth/password/change` | deletes every **other** session; this one stays |
| Reset password by link | `POST /api/auth/password/reset` | deletes **all** sessions of that user |
| Delete account | `DELETE /api/users/me` | user row deleted → sessions and tokens cascade |

Password hash update and session deletion run in one transaction, so a crash
between them can't leave a stolen session alive under the new password.

## Flows

### Register — `POST /api/auth/register`

1. Validate with `registerInput` (email; password 8–128 chars; optional name).
2. Hash the password (argon2id) **before** touching the database.
3. Insert the user; the unique index on `email` decides races. Taken → 409
   `Email already registered`.
4. Start a session (new token) and set the cookie → 201 `{ user }`.
5. Issue an `EMAIL_VERIFY` token (24 h) and mail the link
   `WEB_ORIGIN/verify-email?token=…`. Best-effort: a mail failure is logged by
   error name and does not fail registration (the user can resend).

### Sign in — `POST /api/auth/login`

1. Validate with `loginInput` (no minimum length for existing passwords).
2. Look up credentials by the normalized email.
   - Unknown email → verify the password against a dummy argon2 hash anyway,
     so the response time doesn't reveal whether the account exists.
   - Wrong password → same.
   - Both → 401 `Invalid email or password`.
3. Create a **new** session token (never reuse one — no session fixation) and
   set the cookie → `{ user }`.

An existing session in the same browser is not deleted; the new cookie just
replaces it on the client.

### Password reset

1. `POST /api/auth/password/forgot { email }` always answers **204
   immediately**. The lookup, token and mail run fire-and-forget, so neither
   timing nor a mailer error reveals whether the account exists.
2. For a known email: issue a `PASSWORD_RESET` token (30 min). Issuing a
   token marks every earlier unused token of the same type as used — only the
   latest link works. Mail `WEB_ORIGIN/reset-password?token=…`.
3. The page renders a form; the visitor submits a new password →
   `POST /api/auth/password/reset { token, newPassword }`.
4. In one transaction: redeem the token, set the new hash, delete all the
   user's sessions. Unknown, expired, used and wrong-type tokens all give the
   same 400 `This link is invalid or has expired`.

### Email verification

1. Link from registration, or `POST /api/auth/email/resend` (signed in; no-op
   if already verified).
2. `/verify-email?token=…` renders a **button**, not an automatic
   confirmation: mail scanners and prefetches would otherwise spend the
   single-use token.
3. `POST /api/auth/email/verify { token }` redeems it and sets
   `emailVerifiedAt`.

Verification is informational today: no endpoint requires a verified email.

### Single-use tokens

`consumeToken` (`auth.repository.ts`) finds the token by hash and type, then
runs `updateMany where { id, usedAt: null, expiresAt > now } set usedAt`. Of two
concurrent redemptions only one sees `count === 1`. Tokens travel in request
bodies, never in API URLs, so they don't land in API access logs.

### Account management (signed in)

| Endpoint | Re-enter password | Effect |
| --- | --- | --- |
| `PATCH /api/users/me` | no | change display name |
| `POST /api/auth/password/change` | yes (`currentPassword`) | new hash, other sessions signed out |
| `DELETE /api/users/me` | yes | user deleted; their events stay with `organizerId = null` (admin-only from then on) |

Re-entering the password protects destructive actions from someone using a
borrowed, already signed-in browser. A wrong password → 400
`Current password is incorrect`.

## Authorization

### Levels

1. **Anonymous** — may read: `GET /api/events`, `GET /api/events/:id`,
   `/uploads/*`, and the public auth endpoints (register, login, forgot,
   reset, verify, logout).
2. **Signed in** (`requireAuth`) — everything that creates or changes
   something: events (create, update, delete, upload image), geocoding,
   `/api/auth/me`, account management.
3. **Owner or admin** — changing or deleting a specific event.

There is no admin UI and no endpoint that grants a role. An admin is made
directly in the database:

```sql
update "User" set role = 'ADMIN' where email = 'someone@example.com';
```

### Guards (route level)

```ts
// 401 when anonymous
app.post("/", { preHandler: requireAuth }, handler);

// A whole module: every route in userRoutes requires a session
app.addHook("preHandler", requireAuth);

// 401 when anonymous, 403 when the role differs (not used by any route yet)
app.get("/admin/x", { preHandler: requireRole("ADMIN") }, handler);
```

Inside a guarded handler, read the user with `currentUser(request)`. It throws
if `request.user` is null, so a route that forgot its guard fails loudly
(500) instead of acting as an anonymous user.

### Ownership (service level)

Per-record rules live in services, not routes, so no route can skip them:

```ts
// event.service.ts
export const canModify = (event, actor) =>
  actor.role === "ADMIN" || (event.organizerId !== null && event.organizerId === actor.id);
```

`update` and `remove` load the event, call `assertCanModify` and throw
`ForbiddenError` → 403. `create` takes `organizerId` from the session, never
from the body. Events without an organizer (pre-accounts, or whose organizer
deleted the account) are admin-only.

### In the web app

The web app never decides access; it only hides what the API would refuse.

- `getMe()` (`modules/auth/model/session.server.ts`) reads the current user on the server
  into the TanStack Query cache (`meQuery`, deduplicated with the root
  layout's prefetch). Pages that need a session redirect before any HTML is
  sent:

  ```ts
  if (!(await getMe())) redirect(`/login?next=${encodeURIComponent("/account")}`);
  ```

  Protected pages: `/account`, `/events/new`, `/events/[id]/edit` (the last
  renders "Only the organizer or an admin can edit this event." instead of
  the form when `canModifyEvent` is false).
- `canModifyEvent` (`modules/auth/lib/session.ts`) mirrors the API's `canModify` to show or
  hide edit/delete controls. If the two ever disagree, the API wins.
- `safeNext` turns the `next` parameter of `/login` into a same-site path
  only (blocks `//host`, `/\host`, control-character tricks), so sign-in
  can't be used as an open redirect. It is applied both when rendering the
  page and again in the `login` action.
- On the client, any 401 from a query or mutation sets the cached `me` to
  null (`makeQueryClient`), so the header reflects a session that ended
  elsewhere.

## How the web app carries the session

Two paths reach the API:

```
browser ── /api/* (same origin, cookie sent by the browser) ──▶ proxy ──▶ Fastify
                                                    dev: Next rewrites, prod: nginx

browser ── page / Server Action ──▶ Next server
                                      └─ serverFetch(): Cookie: sid=… + X-Forwarded-For ──▶ Fastify
```

**Browser path.** `request()` (`shared/api/request.ts`) uses relative URLs; the cookie
goes along by itself, and the API's `Set-Cookie` comes straight back through
the proxy. Used by the event form's TanStack mutations and client refetches.

**Server path.** `serverFetch` (`shared/api/request.server.ts`) copies the visitor's
`sid` and `X-Forwarded-For` onto a request to `API_INTERNAL_URL`. Two cases:

- **Server Components** (rendering) can't set cookies. A renewal `Set-Cookie`
  produced by a render-time fetch is dropped; it is delivered later by the
  next browser `/api` call or Server Action.
- **Server Actions** call the API through `send`/`post`
  (`shared/api/server-action.ts`), which runs `applySessionCookie` on every
  response: it parses the API's `sid` `Set-Cookie` and re-issues it on the web
  origin with the same flags (or deletes it when the API cleared it). Sign-out,
  sign-out everywhere and account deletion also delete `sid` themselves, so
  the browser is signed out even if the API was unreachable.

Simple auth forms (sign in, register, forgot/reset, verify, account) are
Server Actions with `useActionState`; they work without JavaScript.

## CSRF

Three layers:

1. `SameSite=Lax` keeps the cookie off cross-site POST/PATCH/PUT/DELETE.
2. The API's `onRequest` hook rejects (403 `Cross-origin request blocked`) a
   state-changing request whose `Origin` header is present and is not
   `WEB_ORIGIN`. This also covers sibling subdomains, which `SameSite`
   treats as same-site. Requests without `Origin` (curl, tests, the Next
   server) pass — they are not a browser CSRF vector.
3. Next.js rejects Server Actions whose `Origin` doesn't match the `Host` it
   sees — which is why nginx must pass `Host $host` to Next
   ([deployment.md](deployment.md)).

Request bodies are parsed by Zod as JSON objects (the image upload, which is
multipart, still needs the cookie and passes the Origin check), so a
cross-site `<form>` post with `text/plain` can't produce a valid request
either.

## Rate limits

`@fastify/rate-limit`, in memory, per process, at `preHandler` (after body
parsing and the session hook, so keys can use the email and the user). Only
routes with `config: { rateLimit: rateLimits.<name> }` (`lib/rate-limits.ts`)
are limited; an exceeded limit answers 429 `Too many attempts. Please try
again later.` with `Retry-After`. Every attempt counts, successful ones
included. Window: 15 minutes unless stated.

| Route | Limit |
| --- | --- |
| `POST /auth/register` | 5 per client IP |
| `POST /auth/login` | 5 per client IP + email (window restarts while blocked) |
| `POST /auth/password/forgot` | 3 per email per hour |
| `POST /auth/password/reset` | 10 per client IP |
| `POST /auth/email/verify` | 10 per client IP |
| `POST /auth/password/change` | 5 per user |
| `POST /auth/email/resend` | 3 per user |
| `DELETE /users/me` | 5 per user |
| `POST /events/upload` | 20 per user |

One limit per route, by design: the plugin runs only the first rate-limit hook
of a request, and stacking several would need a custom wrapper. The cost: the
login limit doesn't stop one address trying many emails, or many addresses
trying one email.

**Plugin pitfalls** (`@fastify/rate-limit` 11.x):

- Each route keeps an LRU of keys, 5000 by default, and forgets the oldest
  when full — a flood of throwaway keys resets a victim's counter. `limit()`
  sets `cache: 100_000` on every route; the plugin-level `cache` option does
  not reach per-route stores.
- Fixed windows: up to twice the limit can pass around a window boundary.
- Counters live in process memory: they reset on restart and multiply with the
  number of API processes. Scaling out needs the plugin's Redis store.

"Client IP" is the plugin's `normalizeIP(request.ip)`: IPv4 as is, IPv6
grouped by /64.
`request.ip` comes from `X-Forwarded-For`, trusted only from the hops in
`TRUSTED_PROXY` (default `127.0.0.1,::1`). Both nginx and the Next server must
be listed — otherwise every Server Action (sign-in included) looks like one
client — and Next must not be reachable directly, because it forwards the
`X-Forwarded-For` it receives.

`buildApp({ rateLimits: false })` (and `RATE_LIMITS=off` in `server.ts`)
skips registering the plugin, which turns them all off; it exists for tests
and the e2e suite only.

## Passwords

- argon2id with the `argon2` package defaults.
- New passwords: 8–128 characters (the cap stops huge bodies from tying up
  argon2). Existing passwords are checked with no minimum, so a rule change
  never locks old accounts out.
- A malformed stored hash is a failed check, not a 500.
- Login and register spend one argon2 operation whether or not the account
  exists (the dummy hash is computed at module load so the first call isn't a
  timing outlier).

## Error responses

| Status | Body `message` | When |
| --- | --- | --- |
| 400 | `Validation error` + `issues` | Zod rejected the body |
| 400 | `This link is invalid or has expired` | bad reset / verify token |
| 400 | `Current password is incorrect` | password change, account deletion |
| 401 | `Authentication required` | `requireAuth` / `requireRole` without a session |
| 401 | `Invalid email or password` | login, unknown email and wrong password alike |
| 403 | `Forbidden` | `requireRole`, wrong role |
| 403 | `You can only change events you organize` | `canModify` failed |
| 403 | `Cross-origin request blocked` | Origin check |
| 409 | `Email already registered` | register |
| 429 | `Too many attempts. Please try again later.` | a rate limit exceeded |

## Configuration

| Variable | App | Role in auth |
| --- | --- | --- |
| `WEB_ORIGIN` | api | Origin check, links in emails, `Secure` cookie when `https:` |
| `TRUSTED_PROXY` | api | whose `X-Forwarded-For` is believed (rate-limit keys, `Session.ip`) |
| `NODE_ENV` | api | only `development`/`test` may use the console mailer; anything else requires a real `Mailer` |
| `RATE_LIMITS` | api | `off` disables limits — e2e only, never in production |
| `API_INTERNAL_URL` | web | where `serverFetch` sends the forwarded cookie |

## Recipes

**Protect a new API route.** Add `{ preHandler: requireAuth }` (or
`requireRole("ADMIN")`), read the user with `currentUser(request)`, and put any
per-record rule in the service next to the data it checks, the way
`canModify` is. If the route checks a password, sends mail or stores files,
add an entry to `rateLimits` and set `config: { rateLimit: rateLimits.<name> }`
on the route.

**Protect a new page.** In the Server Component: `const me = await getMe();`
and `redirect("/login?next=…")` when it is null. For per-record rules, hide
controls with a helper that mirrors the API rule; never rely on it.

**A new form that changes the session** (or may receive a renewal): make it a
Server Action that calls the API through `post`/`send` from
`shared/api/server-action.ts`, so the API's `Set-Cookie` is relayed to the browser.

## Tests

- API: `auth.routes.test.ts`, `auth.email.test.ts`, `user.routes.test.ts`,
  `event.routes.test.ts` (ownership), `app.security.test.ts` (Origin check,
  rate limits, forwarded IP), `password.test.ts`, `crypto.test.ts`,
  `rate-limits.test.ts` (eviction flood). Helpers in `apps/api/src/test/auth.ts`.
- Web: `modules/auth/model/actions.test.ts`, `modules/account/model/actions.test.ts`, `modules/auth/lib/session.test.ts`
  (`safeNext`, `canModifyEvent`), `shared/api/session-cookie.test.ts`.
- E2E: `apps/e2e/tests/auth.spec.ts`, `account.spec.ts`; the signed-in state
  is prepared once in `auth.setup.ts`.
