# Authentication & authorization design

**Date:** 2026-10-01
**Status:** Draft, awaiting review

## Goal

Add user accounts to eventapp: email + password sign-up and sign-in, server-side
sessions, email verification, password reset, and ownership of events — so that
only an event's organizer (or an admin) can change it.

Auth is **self-built** on purpose: this project is a backend-development
learning exercise, so no auth library or hosted provider. That makes the
security rules in this document requirements, not suggestions — there is no
library underneath to catch mistakes.

## Decisions

| Question | Decision |
| --- | --- |
| Identity | Email + password only, no OAuth |
| Password hashing | argon2id (`argon2` package, library defaults) |
| Session mechanism | Opaque random token in an httpOnly cookie, sha256 of it in `Session` — **not** JWT |
| Session lifetime | 30 days, sliding; renewed at most once a day |
| CSRF | `SameSite=Lax` cookie + `Origin` check on state-changing requests |
| Roles | `USER`, `ADMIN` (`UserRole` enum) |
| Address access | None of its own — written only through its event; standalone `/api/addresses` routes removed |
| Ownership | `Event.organizerId`, set from the session, never from the request body |
| Email verification | Recorded (`emailVerifiedAt`), **not enforced** in this iteration |
| Email delivery | `Mailer` interface; dev/test implementation logs or captures, no real provider |
| Rate limiting | `@fastify/rate-limit`, in-memory, on credential and email-sending routes |

## Data model

Already migrated in `20261001093049_auth`. No schema change is part of this
spec.

- **`User`** — `email` (unique, stored normalized), `passwordHash`, `name?`,
  `imageKey?`, `role` (default `USER`), `emailVerifiedAt?`, timestamps.
- **`Session`** — `tokenHash` (unique), `userId` (cascade delete),
  `expiresAt`, `userAgent?`, `ip?`. Indexed on `userId` and `expiresAt`.
- **`AuthToken`** — one-shot tokens. `tokenHash` (unique), `type`
  (`AuthTokenType`), `userId` (cascade delete), `expiresAt`, `usedAt?`.
  Indexed on `(userId, type)`.
- **`Event.organizerId`** — nullable FK to `User`, `onDelete: SetNull`.

### Enums

- `UserRole.USER` — default. Creates events, edits and deletes only their own.
- `UserRole.ADMIN` — may edit and delete any event, including ownerless ones.
- `AuthTokenType.PASSWORD_RESET` — authorizes setting a new password once.
- `AuthTokenType.EMAIL_VERIFY` — authorizes setting `emailVerifiedAt` once.

Token lookups always filter by `type` as well as `tokenHash`, so a verification
token can never be redeemed as a reset token.

### Existing events

Events created before this change have `organizerId = null`. They stay
publicly readable, and only an admin can edit or delete them. No backfill;
making `organizerId` required later would follow the expand → backfill →
contract pattern in `docs/architecture.md`.

## Security rules

These are the invariants the implementation and its tests must hold.

### Passwords

- Hashed with argon2id. Never stored, logged, or returned in plain text.
- Length 8–128 characters, no composition rules. The upper bound stops a
  multi-megabyte "password" from tying up the hasher.

### Emails

- Normalized with `trim().toLowerCase()` in exactly one place, the auth
  service, before every lookup and write.
- The unique index is the final guard against concurrent registrations; a
  Prisma `P2002` on `email` maps to `EmailTakenError`.

### Tokens (session and one-shot)

- Generated with `crypto.randomBytes(32)`, encoded base64url, sent to the
  client.
- Only `sha256(token)` (hex) is stored. sha256, not argon2: the token already
  has 256 bits of entropy, so there is nothing to brute-force, and every
  authenticated request hashes it.
- A database leak therefore yields no usable sessions or reset links.

### Login

- One error for both "no such email" and "wrong password":
  `InvalidCredentialsError` → `401 { message: "Invalid email or password" }`.
- When the email is unknown, the service still runs an argon2 verify against a
  fixed dummy hash, so response time does not reveal whether the account
  exists.
- Every successful login creates a **new** session (no reuse of an existing
  token — prevents session fixation).

### Registration enumeration (accepted trade-off)

Registering an existing email returns `409 Email already registered`, which
reveals that the account exists. The fully enumeration-safe alternative
(always "check your email") makes sign-up confusing for a learning project.
Accepted, mitigated by rate limiting. Login and forgot-password do **not** leak.

### API responses

- `passwordHash` must never leave the repository layer. The user repository
  reads users through an explicit `select` of public fields, except for the
  single credential lookup used by login and password change.
- Responses are shaped by the `userPublic` contract (see below). An
  integration test asserts `passwordHash` is absent from every user-returning
  endpoint.

### Logging

Never log request bodies of auth routes, `Cookie`/`Set-Cookie` headers, or
tokens. Fastify's default request logging does not log bodies or headers;
nothing in the auth module may add them.

## Sessions

### Cookie

```
Set-Cookie: sid=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000[; Secure]
```

- `HttpOnly` — page JavaScript cannot read it, so XSS cannot exfiltrate it.
- `SameSite=Lax` — not sent on cross-site POST/PATCH/DELETE.
- `Secure` when `WEB_ORIGIN` is `https:` (not tied to `NODE_ENV`, so a
  deployment that forgets to set it still gets `Secure`). Omitted locally: the
  dev servers run on plain HTTP.
- Set and cleared via `@fastify/cookie`. The cookie is not signed — the token
  is already unguessable, and the server-side lookup is the check.

### Lifetime

- `expiresAt = now + 30 days` on creation.
- **Sliding renewal:** when a valid session has less than 29 days left
  (i.e. it was last renewed over a day ago), push `expiresAt` to now + 30 days
  and re-send the cookie. At most one write per session per day.
- Expired sessions are deleted when encountered during lookup. A periodic
  cleanup job is out of scope; the `expiresAt` index exists for it.

### Revocation

| Event | Sessions deleted |
| --- | --- |
| Logout | The current one |
| Logout everywhere | All of the user's |
| Password change | All except the current one |
| Password reset | All of the user's |
| Account deletion | All (cascade) |

## CSRF

The API and web app are same-site in development (`localhost:3000` and
`localhost:4000` differ only by port), so the cookie is sent on API calls and
`SameSite=Lax` stops it on cross-site writes.

`SameSite` treats sibling subdomains as same-site, so it is not the whole
answer in production. Add an `onRequest` hook: for `POST`, `PATCH`, `DELETE`,
reject with `403` when an `Origin` header is present and is not `WEB_ORIGIN`.
Requests without `Origin` (curl, `app.inject()` in tests) pass — CSRF is a
browser attack, and browsers always send `Origin` on these methods.

## API

### Plugins and wiring (`apps/api/src/app.ts`)

- Register `@fastify/cookie`.
- CORS: `credentials: true`, `origin` from `WEB_ORIGIN` instead of the
  hard-coded string. `allowedHeaders`/methods unchanged. Add the existing
  CORS regression test's sibling: a credentialed preflight returns
  `Access-Control-Allow-Credentials: true`.
- Register `@fastify/rate-limit` with `global: false`; routes opt in.
- Register the session plugin (below) before route modules.

### Session plugin — `apps/api/src/plugins/session.ts`

Wrapped with `fastify-plugin` so its decorators reach every route module.

- Decorates `request.user: UserPublic | null` and `request.sessionId: string | null`.
- `onRequest` hook: read `sid` cookie → sha256 → find session joined with
  user → if missing, set `user = null`; if expired, delete it and set
  `user = null`; otherwise attach the user and apply sliding renewal.
- Exports two `preHandler` guards:
  - `requireAuth` → `401 { message: "Authentication required" }` when
    `request.user` is null.
  - `requireRole("ADMIN")` → `401` when anonymous, `403` when the role does
    not match.

**401 vs 403:** 401 means "we don't know who you are"; 403 means "we know,
and you may not". Ownership failures are 403.

### Modules

Same layering as the existing modules (`docs/architecture.md`).

```
apps/api/src/modules/auth/
  auth.routes.ts       register, login, logout, sessions, password, email flows
  auth.service.ts      business rules + domain errors
  auth.repository.ts   Session and AuthToken queries
  auth.schema.ts       re-exports from @repo/contracts
  auth.types.ts
apps/api/src/modules/users/
  user.routes.ts       profile endpoints
  user.service.ts
  user.repository.ts   the only place User rows are read/written
  user.schema.ts
  user.types.ts
apps/api/src/lib/
  crypto.ts            generateToken(), hashToken() — pure, unit-tested
  password.ts          hashPassword(), verifyPassword(), DUMMY_HASH
  mailer.ts            Mailer interface + console and in-memory implementations
```

Domain errors (no HTTP knowledge, mapped in routes like `event.routes.ts`):
`InvalidCredentialsError` (401), `EmailTakenError` (409),
`InvalidTokenError` (400 — covers unknown, expired, already used and
wrong-type tokens with one message), `WrongPasswordError` (400, for password
change), `ForbiddenError` (403).

### Endpoints — `/api/auth`

| Method & path | Auth | Rate limit | Behaviour |
| --- | --- | --- | --- |
| `POST /register` | — | 5 / 15 min / IP | Create user, issue `EMAIL_VERIFY` token and send it, create session, set cookie. `201 { user }`. `409` if email taken. |
| `POST /login` | — | 5 / 15 min / IP+email | Verify credentials, create session, set cookie. `200 { user }`. `401` on bad credentials. |
| `POST /logout` | optional | — | Delete current session, clear cookie. `204`. Idempotent: `204` even without a session. |
| `POST /logout-all` | required | — | Delete all of the user's sessions, clear cookie. `204`. |
| `GET /me` | — | — | `200 { user }` or `401`. The web app's source of truth for "who am I". |
| `POST /password/change` | required | 5 / 15 min / user | Body `{ currentPassword, newPassword }`. Verify current, rehash, delete other sessions. `204`. |
| `POST /password/forgot` | — | 3 / 15 min / IP | Body `{ email }`. If the user exists, invalidate their unused reset tokens and send a new one (30 min). **Always `204`**, so it cannot be used to probe emails. |
| `POST /password/reset` | — | 10 / 15 min / IP | Body `{ token, newPassword }`. Consume token, set new hash, delete all sessions. `204`. Does not log the user in. |
| `POST /email/verify` | — | 10 / 15 min / IP | Body `{ token }`. Consume token, set `emailVerifiedAt`. `204`. |
| `POST /email/resend` | required | 3 / 15 min / user | Issue a new `EMAIL_VERIFY` token (24 h) if not yet verified. `204`. |

Rate-limit keys: "IP" is `request.ip`; "IP+email" and "user" need the parsed
body or `request.user`, so those routes run the limiter in `preHandler`
(`config.rateLimit.hook`) instead of the default `onRequest`, where neither
exists yet. A limited request gets `429`.

Tokens travel in the request **body**, not the URL path or query, of the API
call, so they don't end up in API access logs. (The link in the email still
carries the token in the web page's query string; the web page posts it to
the API.)

### Endpoints — `/api/users`

| Method & path | Auth | Behaviour |
| --- | --- | --- |
| `PATCH /me` | required | Body `{ name }`. `200 { user }`. |
| `DELETE /me` | required | Body `{ password }`. Deletes the user; sessions and tokens cascade, their events become ownerless. Clears cookie. `204`. |

Changing email and avatar upload are out of scope.

### Consuming one-shot tokens

Redeeming a token must be atomic, otherwise two concurrent requests could both
use it:

```ts
// in a transaction
const { count } = await tx.authToken.updateMany({
  where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
  data: { usedAt: now },
});
if (count !== 1) throw new InvalidTokenError();
```

The follow-up write (new password hash, or `emailVerifiedAt`) happens in the
same transaction.

Token lifetimes: `PASSWORD_RESET` 30 minutes, `EMAIL_VERIFY` 24 hours.

### Mailer

```ts
interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}
```

- `ConsoleMailer` (dev): logs the message, including the link, via the app
  logger. This is the one deliberate exception to "never log tokens", and it
  is dev-only.
- `MemoryMailer` (test): stores messages so tests can pull the token out of
  the link.
- `buildApp()` takes an optional `{ mailer }` option, so tests inject
  `MemoryMailer`. The `ConsoleMailer` default applies only when `NODE_ENV` is
  `development` or `test`; otherwise (including unset) `buildApp()` throws
  without an injected mailer.
- Links are built from `WEB_ORIGIN`:
  `${WEB_ORIGIN}/reset-password?token=…`, `${WEB_ORIGIN}/verify-email?token=…`.

A real provider (SMTP, Resend, …) is a new `Mailer` implementation and nothing
else.

### Changes to existing modules

**Events**

| Route | Before | After |
| --- | --- | --- |
| `GET /`, `GET /:id` | public | public; responses include `organizerId` |
| `POST /` | public | `requireAuth`; `organizerId = request.user.id` |
| `PATCH /:id`, `DELETE /:id` | public | `requireAuth` + owner-or-admin check, else `403` |
| `POST /upload` | public | `requireAuth` |

The ownership check lives in `event.service.ts`
(`assertCanModify(event, user)`), not in routes, so it is unit-testable and
can't be bypassed by a new route. `organizerId` is not in the create/update
contracts — the client cannot set or change it.

**Addresses — folded into events.** An address exists only as an event's
venue, so it gets no access rules of its own: whoever may modify the event may
modify its venue, and nobody else can reach it.

Today the web app creates an address with `POST /api/addresses`, then sends its
`addressId` to the event endpoint, and edits it with `PATCH /api/addresses/:id`.
Those standalone write routes would each need their own ownership check — and
without one, any signed-in user could rewrite another event's venue by id. So
instead:

- The venue travels inside the event payload. `createEventInput` /
  `updateEventInput` replace `addressId` with
  `address: createAddressInput.nullable().optional()`:
  - omitted → venue unchanged;
  - `null` → venue removed (the `Address` row is deleted);
  - an object → venue created, or the existing one replaced in place (omitted optional fields become null).
- `event.service` writes the event and its address in one transaction, after
  `assertCanModify`. The `addresses` module is deleted: the event repository writes the venue with Prisma nested writes (`create` / `upsert` / `delete`), so nothing calls an address repository.
- Deleting an event deletes its address in the same transaction, so addresses
  no longer outlive their event (before this change they were orphaned, and
  the e2e suite had to clean them up by hand).
- `POST`, `PATCH`, `DELETE /api/addresses` are removed. `GET /api/addresses`
  and `GET /api/addresses/:id` are removed too; the event response already
  embeds its address.
- `UnknownAddressError` and `AddressAlreadyLinkedError` disappear: the client
  can no longer name an address id, so it cannot point at a missing or
  already-linked one.
- Web: `addressesApi` and `resolveAddressId` go away; the forms send `address`
  with the event.

This is a refactor of the event contract that would be worth doing even
without auth; auth is what makes it necessary. The schema (FK on
`Event.addressId`, `@unique`) is unchanged.

**Geocoding** — `GET /api/geocode` requires auth. Only the event form uses it,
and the form now requires a session; this stops anonymous traffic from
spending the shared Photon quota.

## Shared contracts (`@repo/contracts`)

Added to `packages/contracts/src/index.ts`, keeping it a single file with no
relative imports (see `docs/architecture.md`).

```ts
// Normalize first, then validate the format. Normalization is repeated in the
// service, which is authoritative.
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(8).max(128);

export const registerInput = z.object({ email, password, name: z.string().trim().min(1).max(100).optional() });
export const loginInput = z.object({ email, password: z.string().min(1).max(128) });
export const changePasswordInput = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
export const forgotPasswordInput = z.object({ email });
export const resetPasswordInput = z.object({ token: z.string().min(1), newPassword: password });
export const verifyEmailInput = z.object({ token: z.string().min(1) });
export const updateProfileInput = z.object({ name: z.string().trim().min(1).max(100).nullable() });
export const deleteAccountInput = z.object({ password: z.string().min(1).max(128) });

export const userPublic = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  imageKey: z.string().nullable(),
  role: z.enum(["USER", "ADMIN"]),
  emailVerifiedAt: z.string().nullable(),   // ISO on the wire
  createdAt: z.string(),
});
```

`loginInput.password` deliberately has no minimum of 8: a login form must not
reveal password rules, and old accounts could predate a rule change.

## Web app

### Request layer

`request()` in `apps/web/app/lib/api.ts` sends `credentials: "include"` on
every call. Without it the browser neither sends nor stores the `sid` cookie
on cross-origin fetches.

### Auth state — `apps/web/app/lib/auth.ts`

- `useMe()` — TanStack Query on `["me"]` calling `GET /api/auth/me`; a `401`
  resolves to `null` rather than an error.
- `login`, `register`, `logout`, … functions; on success they set or
  invalidate `["me"]`.
- A global handler: any `ApiError` with status `401` from a mutation
  invalidates `["me"]`, so the UI notices an expired session.

### Routes

| Route | Purpose |
| --- | --- |
| `/login?next=` | Sign-in form; redirects to `next` (same-origin paths only) on success |
| `/register` | Sign-up form |
| `/forgot-password` | Email form; always shows "If an account exists, we've sent a link" |
| `/reset-password?token=` | New-password form |
| `/verify-email?token=` | Posts the token on mount, shows the result |
| `/account` | Name, change password, resend verification, sign out everywhere, delete account |

### Guarding pages and controls

- `/events/new`, `/events/[id]/edit` and `/account` redirect to
  `/login?next=…` when `useMe()` resolves to `null`.
- The list shows edit/delete controls only when
  `me.id === event.organizerId || me.role === "ADMIN"`.
- The header shows the user's name/email with "Account" and "Sign out", or
  "Sign in" / "Register".

All of this is UX. The API enforces every rule independently; a hidden button
is not a security control.

`next` is validated to be a relative path starting with a single `/`,
otherwise it defaults to `/` — an unvalidated redirect target is an open
redirect.

Forms use TanStack Form + the shared contracts, StyleX for styling, and
vendored `components/ui` primitives, like the event form.

## Environment

| Variable | Used by | Notes |
| --- | --- | --- |
| `WEB_ORIGIN` | api | CORS origin, `Origin` check, email links. Defaults to `http://localhost:3000`. |

`docs/architecture.md`'s environment table gets this row.

## Seed

`packages/db/prisma/seed.ts` creates two dev users with known passwords,
`admin@example.test` (`ADMIN`) and `user@example.test` (`USER`), both verified,
and assigns the seeded events to `user@example.test`. The seed hashes with the
same `argon2` settings as the API.

Promoting a real user to admin is a manual `UPDATE` for now.

## Testing

Per `docs/testing-conventions.md`: integration first, against `eventapp_test`.

**Setup changes**

- `vitest.setup.ts` also deletes `AuthToken`, `Session`, `User` (children
  before parents; `Event` already precedes them).
- Test helper `signUp(app, overrides?)` → `{ user, cookie }`, where `cookie`
  is the `sid=…` pair from `Set-Cookie`, ready for `headers: { cookie }` in
  `app.inject()`.
- Tests build the app with `MemoryMailer`. Rate limits are configurable and
  set high in tests, except in the tests that assert them.

**Unit**

- `lib/crypto.ts`: tokens are 43-char base64url and differ; `hashToken` is
  deterministic.
- `lib/password.ts`: hash ≠ input; verify accepts the right password, rejects
  a wrong one.
- `event.service` `assertCanModify`: owner ✓, admin ✓, other user ✗,
  ownerless + user ✗, ownerless + admin ✓.

**Integration (`app.inject()`)**

- Register → `201`, `Set-Cookie` has `HttpOnly` and `SameSite=Lax`, `GET /me`
  with that cookie returns the user; duplicate email (different case) → `409`.
- Login: right → `200` + new session; wrong password and unknown email return
  identical `401` bodies.
- The stored `Session.tokenHash` is not equal to the cookie value.
- No response from any user-returning endpoint contains `passwordHash`.
- Logout invalidates the cookie: subsequent `GET /me` → `401`.
- Expired session (set `expiresAt` in the past via Prisma) → `401`, row deleted.
- Password change keeps the current session, kills a second one; wrong current
  password → `400`.
- Forgot password returns `204` for known and unknown emails; only the known
  one produces a `MemoryMailer` message.
- Reset: token from the mail works once; second use → `400`; expired → `400`;
  an `EMAIL_VERIFY` token posted to reset → `400`; all sessions gone after.
- Verify email sets `emailVerifiedAt`.
- Events: anonymous create → `401`; create sets `organizerId` and ignores one
  in the body; other user's PATCH/DELETE → `403`; admin's → `200`/`204`.
- `Origin: https://evil.example` on a `POST` → `403`; correct origin passes.
- Rate limit: the 6th login attempt in the window → `429`.
- CORS preflight from `WEB_ORIGIN` allows credentials.
- Venue via the event: create with `address` creates the row; update edits it
  in place; `address: null` and event deletion both delete the `Address` row;
  another user's PATCH carrying an `address` → `403` and the venue is
  unchanged.
- `POST`/`PATCH`/`DELETE /api/addresses` → `404` (routes gone).
- Existing event and geocode tests sign up first and send the cookie;
  `address.routes.test.ts` is removed with the routes, its cases moving to
  `event.routes.test.ts`.

**E2E**

- Register → create event → see edit controls → sign out → edit controls gone
  and `/events/new` redirects to `/login`.
- Existing specs sign in via a Playwright setup project and reuse its storage
  state, so each spec doesn't repeat the login UI.
- Cleanup: users are created with unique emails and removed through
  `DELETE /api/users/me`; the teardown project deletes the run's events and
  then its user; a run killed before teardown leaves its uniquely-named
  `e2e-*` user and that user's events behind (the next run's sweep runs as a
  different user, gets `403` on them and skips them).

## Delivery order

Each step leaves `pnpm check-types && pnpm lint && pnpm test` green.

1. `lib/crypto.ts`, `lib/password.ts`, session plugin, cookie + CORS changes,
   register / login / logout / me.
2. Fold the address into the event payload; remove `/api/addresses` write
   routes, `addressesApi` and `resolveAddressId`; delete the address with its
   event. No auth yet — a pure refactor, existing tests adapted.
3. Event ownership, auth on events and geocode; update existing tests.
4. Web: credentials, `useMe`, login/register pages, header, guards, owner-only
   controls; e2e.
5. Mailer, email verification, forgot/reset password, web pages for them.
6. Account page: change password, logout-all, profile, delete account.
7. Rate limiting, `Origin` check, seed users, docs (`architecture.md` layout,
   module list, env table).

## Known limitations

- **In-memory rate limits** reset on restart and don't work across multiple
  API instances. Fine for one process; Redis-backed storage is the upgrade.
- **Registration reveals existing emails** (see Security rules).
- **No expired-session sweep.** Rows are deleted lazily on lookup; sessions
  never presented again stay until a cleanup job exists.
- **Unattached uploads have no owner.** The service rejects an `imageKey`
  already used by another event, but a file uploaded and not yet attached to
  an event belongs to no one and can be claimed by anyone who learns its key.
- **`trustProxy` must be configured** behind a reverse proxy, or every client
  shares one IP rate-limit bucket.
- **The dev seed has no production guard.** It wipes users, events and
  addresses; never run it against real data.

## Out of scope

- OAuth / social login, magic links, passkeys
- Two-factor authentication
- Changing email address
- Avatar upload (`User.imageKey` exists but stays unused)
- Enforcing email verification for any action
- Admin UI for managing users and roles
- A real email provider
- Account lockout after repeated failures (rate limiting covers the basics)
- "Remember me" toggle / per-session device list UI
