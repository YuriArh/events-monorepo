# Architecture

## Layout

```
apps/
  web/        Next.js 16 (App Router, Turbopack), React 19, StyleX, TanStack Query
  api/        Fastify 5, Zod validation
  e2e/        Playwright suite covering both apps
packages/
  db/         Prisma client + schema, exported as @repo/db
  contracts/  Zod schemas shared by the API and web app
  ui/         Shared React components (not currently consumed by web)
  eslint-config/, typescript-config/   Shared config
```

Postgres runs in Docker (`docker-compose.yml`), one container serving two
databases: `eventapp` for development and `eventapp_test` for integration tests.

## Data flow

```
browser ── /api/*, /uploads/* (same origin) ──▶ proxy ──▶ Fastify
   ▲                                      (dev: Next rewrites; prod: nginx)
   │ HTML + dehydrated query cache
Next server (Server Components, Server Actions)
   └── serverFetch: absolute API_INTERNAL_URL + forwarded Cookie / client IP ──▶ Fastify

Fastify route → service → repository → Prisma → Postgres
```

The browser only ever talks to the web origin, so the `sid` cookie belongs to
the web host and the Next server can read it. The Next server calls the API
directly with `serverFetch`/`serverRequest` (`lib/api.server.ts`), forwarding
the visitor's cookie and IP. The browser uses the same `apiFetch`/`request`
core (`lib/api.ts`) with relative URLs. The web app does not import
`@repo/db`; only `apps/api` touches the database.

## Web app routes

Every page is a Server Component; `"use client"` lives only in the components
named below. The root layout prefetches `me` and wraps the tree in
`HydrationBoundary`; `SiteHeader` (client) reads it.

- `/` — the event list. Prefetches the list; renders `EventList`, whose
  "Created" dates are `LocalDate` islands (viewer's time zone, like
  `LocalDateTime`).
- `/events/[id]` — event detail (rendered per request, `notFound()` → HTTP
  404). Renders `EventDetail`; the dates (`LocalDateTime`, viewer's time zone)
  and the owner's Edit/Delete (`EventOwnerActions`, `DeleteEventDialog`) are
  client islands.
- `/events/new` — create form (`NewEventForm` → `EventForm`). Guarded on the
  server: signed out → redirect to `/login?next=…` in the HTTP response.
- `/events/[id]/edit` — `EditEventForm` (venue included, sent inside the event
  payload). Guarded on the server (sign-in and `canModifyEvent`); the event is
  prefetched and hydrated into the form.
- `/login`, `/register`, `/forgot-password`, `/reset-password`,
  `/verify-email` — `AuthPage` plus the matching form from `auth-forms`,
  submitted through Server Actions (`app/actions/auth.ts`).
- `/account` — `AccountSections`, guarded on the server, Server Actions in
  `app/actions/account.ts`.

**Card.** The vendored `components/ui/card.tsx` uses React context without
`"use client"`, so a Server Component can't render it. Server Components import
`Card`/`CardContent` from `components/card.tsx`, a client re-export of it. Do
not import `components/ui/card` from a Server Component.

Create and edit are full routes, not a dialog over the list page: the list's
"New Event" and per-row edit controls are links (`next/link`), not buttons
that open a modal. Only the delete confirmation is a dialog, since it doesn't
need a form.

## Data on the web

Events and the current user are fetched **on the server, into the TanStack
Query cache**, and read on the client with `useQuery`:

- `lib/queries.ts` holds the shared query options (`eventQueries.list/detail`,
  `meQuery`, `meKey`) parameterised by a fetcher, so the server prefetch and
  the client `useQuery` use the same key and function.
- A page gets the per-request server client with `getServerQueryClient()`
  (`lib/query-client.server.ts`: React `cache`, no retry, `staleTime > 0`),
  fills it with `prefetch(queryClient, options)` (same file:
  `queryClient.query(options)` with errors swallowed, so the client's
  `useQuery` shows them) or awaits `queryClient.query(options)` when it needs
  the data itself, passing `serverRequest` as the fetcher, and renders its
  client component inside `<HydrationBoundary state={dehydrate(queryClient)}>`.
  The browser uses the singleton from `lib/query-client.ts`. Use
  `queryClient.query`: the older fetch/prefetch/ensure methods are deprecated
  in the installed TanStack Query.
- The current user is `getMe()` (`lib/session.server.ts`), deduplicated with
  the layout's prefetch; pages use it to redirect or `notFound()` before any
  HTML is sent. Pure helpers (`safeNext`, `canModifyEvent`) live in
  `lib/session.ts`.

**Mutations.** Simple forms (sign-in, registration, password flows, account)
are Server Actions in `app/actions/*` using `useActionState` with the
`FormState` from `lib/form-state.ts`; they work without JavaScript. The
complex, interactive event form keeps TanStack Form and TanStack Query
mutations through `/api`.

**Cookies are set only in Server Actions** (and Route Handlers), never while
rendering: the action relays the API's `Set-Cookie` with `cookies().set/delete`
(`applySessionCookie`, `lib/set-cookie.ts`).

**Renewal limitation.** The API renews a session at most once a day by sending
a fresh `Set-Cookie`. A Server Component render cannot set cookies, so a
renewal triggered by a server-side fetch is not delivered to the browser; it
happens when a browser-side `/api` call or Server Action next carries the
session. A visitor who only browses server-rendered pages is therefore renewed
late, not logged out early.

## API module layering

Modules: `auth/`, `users/`, `events/`, `geocoding/`.

Each feature under `apps/api/src/modules/<name>/` splits into four files, and the
dependency direction only ever points down:

| File              | Responsibility                                              |
| ----------------- | ----------------------------------------------------------- |
| `*.routes.ts`     | HTTP only — parse input with Zod, map errors to status codes |
| `*.service.ts`    | Business rules, domain errors (e.g. `EventNotFoundError`)    |
| `*.repository.ts` | The only place Prisma is called                              |
| `*.schema.ts`     | Zod schemas for request validation                           |
| `*.types.ts`      | Types inferred from the schemas plus Prisma model types      |

Routes never call Prisma directly, and the repository never throws HTTP
concerns. This is what makes the service layer testable without a web server,
and it's why swapping the data layer stays a one-file change.

`geocoding/` doesn't follow that exact split: it proxies an upstream service
rather than owning a table, so it has no `*.repository.ts`, and instead adds a
`*.mapper.ts` (Photon feature → `GeocodeSuggestion`). It keeps `*.routes.ts`,
`*.service.ts`, `*.schema.ts`, and `*.types.ts`.

`buildApp()` in `apps/api/src/app.ts` constructs the Fastify instance and is
exported separately from `server.ts` (which listens), so tests can call
`app.inject()` without binding a port.

## Shared contracts

Request validation lives in `@repo/contracts`, not in either app. For events,
the package exports two schemas derived from one field shape: a wire schema
(ISO date strings) that the browser form validates against, and a payload
schema (coerced `Date` objects) that the API parses request bodies with.
The venue has no endpoint of its own: `createAddressInput` is used only as the nested `address` field of the event schemas. The API's
`*.schema.ts` files are thin re-exports, so the module layering is unchanged.

An event's venue (`Address`) is part of the event. It is created, replaced and
deleted only through the event endpoints — `address` omitted leaves it alone,
`null` deletes it, an object creates or replaces it — and deleting an event
deletes its venue. There is no `/api/addresses`. This keeps access control in
one place: whoever may change the event may change its venue.

The server remains authoritative. Client-side validation is a UX improvement,
never the security boundary.

`@repo/contracts` is consumed as raw TypeScript: its `package.json` `exports`
field points at `src/index.ts` directly, with no build step. The compiled API
therefore imports a `.ts` file at runtime, which relies on Node's built-in
type-stripping (Node ≥ 24) rather than a compiled `dist/` output.

`packages/contracts/src/index.ts` is deliberately a **single file with no
relative imports** — this is enforced by a comment in the file, not just
convention, and should stay that way. The API compiles it under NodeNext,
which requires relative imports to carry a `.js` extension even though the
source is `.ts`; the web app resolves it through Turbopack, which cannot
resolve those `.js` specifiers back to the `.ts` files that actually exist.
Splitting the module into several files satisfies one resolver at the expense
of the other. Keeping everything in one file with nothing to resolve satisfies
both. Don't split it up to "tidy up" the schemas without solving that
resolution conflict first.

## Geocoding

Address search proxies Photon through `GET /api/geocode`; the browser never
calls the geocoder directly. The proxy is the only place that knows the upstream
URL, and it is what sets a `User-Agent` identifying this application — a header
browsers cannot set — caches responses, collapses concurrent identical queries
and filters out results that cannot fill `line1`, `city` and `country`, that
have no usable `[lon, lat]` coordinates, or that have no `osm_type`/`osm_id`.

Nominatim was the original choice and is not usable here: its policy forbids
client-side autocomplete outright and caps the public instance at one request
per second. Photon is built for type-ahead over the same OpenStreetMap data.

Because filtering happens server-side, the response carries a `filtered` count
alongside `suggestions` so the form can tell "nothing matched" apart from
"matches existed but none were usable" — two different messages to the user.

Addresses store the full Photon feature in `Address.raw` alongside the derived
columns and `lat`/`lon`/`osmId`. All of those are nullable: addresses created
before geocoding existed have none of them.

## Authentication

Self-built, email + password. Full design: `docs/superpowers/specs/2026-10-01-auth-design.md`.

- **Sessions** live in Postgres. The `sid` cookie (`HttpOnly`, `SameSite=Lax`,
  `Secure` whenever `WEB_ORIGIN` is `https:` — `COOKIE_SECURE` in
  `lib/config.ts`, deliberately not tied to `NODE_ENV`) carries a random
  32-byte token; `Session.tokenHash` stores only its sha256. 30-day lifetime, renewed at most once a day.
- **`plugins/session.ts`** resolves the cookie on every request into
  `request.user` (a `PublicUser`, never containing `passwordHash`).
  `requireAuth` -> 401, `requireRole` -> 403. Handlers behind `requireAuth` read
  the user with `currentUser(request)`.
- **Authorization** is in services, not routes: `canModify` in
  `event.service.ts` allows the organizer or an admin.
- **One-shot tokens** (`AuthToken`: password reset, email verification) are
  hashed the same way and redeemed with a conditional `updateMany`, which is
  what makes them single-use under concurrency.
- **Mail** goes through the `Mailer` interface (`lib/mailer.ts`): logged to
  the console in development, captured in memory in tests. There is no real
  provider yet. The console fallback fails closed: `buildApp` throws when no
  `Mailer` is injected unless `NODE_ENV` is exactly `development` or `test`
  (unset counts as production).
- **No account-existence leak**: `POST /api/auth/password/forgot` replies 204
  immediately and runs the reset work fire-and-forget (failures are logged by
  error name only), so neither timing nor mailer errors reveal whether an
  account exists. Registration creates the user and session first, then sends
  the verification email best-effort: a mail failure doesn't fail it.
- **CSRF**: `SameSite=Lax` plus an `Origin` check on POST/PATCH/PUT/DELETE. A
  request whose `Origin` header is present and differs from `WEB_ORIGIN` is
  rejected (403); requests with no `Origin` (curl, server-to-server, tests)
  pass. `WEB_ORIGIN` is normalized with `new URL(...).origin`.
- **Rate limits** (`lib/rate-limits.ts`) are in memory, per process, and run
  at `preHandler` so keys can use the body or `request.user`. They cover
  register, login, password forgot/reset, email verify/resend, password change
  and `DELETE /api/users/me` (password re-check). Login keys on
  `clientKey(ip)` plus the email, and the signed-in routes key on the user
  with `clientKey(ip)` as the fallback; `clientKey` groups IPv6 addresses by
  /64. The IP-only routes use the plugin's default key, which also groups IPv6
  by /64. Behind a reverse proxy, configure Fastify's `trustProxy`, or every
  client shares one IP bucket.
- **Event images**: the service rejects (409) an `imageKey` that another event
  already uses, so one user can't make the server delete another user's
  uploaded file. An uploaded file not yet attached to an event has no owner.
  `imageKeySchema` accepts only the exact lowercase shape `buildImageKey`
  generates, so an upper-case variant (the same file on a case-insensitive
  filesystem) can't slip past that exact-match check.

## Error handling

Routes translate domain errors into responses. The global error handler in
`app.ts` is the safety net:

- `ZodError` → 400 with the issue list
- any error carrying a 4xx `statusCode` (Fastify's own) → passed through
- everything else → 500, logged

Do not let the handler swallow a client error as a 500 — that once masked a
malformed-request bug as a server fault.

## Database migrations

Schema changes go through `prisma migrate`, never `db push` — migrations are
reviewable SQL files in `packages/db/prisma/migrations/`.

```bash
pnpm --filter @repo/db exec prisma migrate dev --name <change>   # author + apply
pnpm --filter @repo/db exec prisma migrate deploy                # apply existing
pnpm --filter @repo/db exec prisma migrate status                # check drift
```

Adding a **required** column to a populated table cannot be done in one step.
Generate the migration without running it, then edit it into expand → backfill →
contract:

```bash
prisma migrate dev --create-only --name add_thing
# edit migration.sql: add nullable, UPDATE to backfill, then SET NOT NULL
prisma migrate dev
```

`20260918134547_add_event_details` is the worked example.

To put an existing database under migration control without dropping it, write
the current state to a migration and mark it applied rather than executing it:

```bash
prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o <file>
prisma migrate resolve --applied <migration_name>
```

Prisma blocks AI agents from running destructive migrate commands unless
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` is set to the user's consent text.

## Dev seed

`packages/db/prisma/seed.ts` creates `admin@example.test` and
`user@example.test` (password `password123`); the regular user owns the sample
events. It wipes users, events and addresses first, so never run it against a
database holding real data. Before any query it refuses to run when
`NODE_ENV=production`, or when the `DATABASE_URL` host is not `localhost`,
`127.0.0.1`, `::1` or `postgres` (the compose service). `SEED_ALLOW_ANY_DB=1`
lifts the host check only, for a deliberately disposable remote database.

## Image uploads

`POST /api/events/upload` takes a multipart file and returns `{ imageKey }`;
the event is then created or updated with that key as a normal JSON request.
Keeping upload separate leaves the event contract as plain JSON.

- Files land in `apps/api/uploads/` (gitignored) and are served at `/uploads/*`.
- The stored `imageKey` is a **filename, not a URL** — swapping local disk for
  object storage later should only change how URLs are built.
- Filenames are generated server-side. A client-supplied filename can contain
  path separators and escape the uploads directory.
- Type is allowlisted by MIME type, size capped at 5MB.
- Deleting an event deletes its file; replacing an image deletes the old one.

Local disk does not survive container restarts or redeploys. This is fine for
development; production needs object storage.

## Environment

| Variable              | Used by  | Notes                                     |
| --------------------- | -------- | ----------------------------------------- |
| `DATABASE_URL`        | api, db  | `apps/api/.env`, `packages/db/.env`        |
| `API_INTERNAL_URL`    | web      | Where the Next server (and the dev rewrites) reach Fastify. Defaults to `http://localhost:4000` |
| `API_PROXY`           | web      | `off` disables the dev rewrites of `/api` and `/uploads` (set it behind nginx) |
| `SITE_URL`            | web      | `metadataBase`. Defaults to `http://localhost:3000` |
| `TRUSTED_PROXY`       | api      | Comma-separated addresses whose `X-Forwarded-For` Fastify trusts (`trustProxy`). Defaults to `127.0.0.1,::1` |
| `WEB_ORIGIN`          | api      | Origin check, links in emails. Defaults to `http://localhost:3000`. An `https:` origin makes the session cookie `Secure` |
| `NODE_ENV`            | api, db  | `development` (set by the api `dev` script) and `test` (set by Vitest) allow the console mailer; anything else, including unset, requires an injected `Mailer` and is treated as production. `production` also makes the db seed refuse to run |

`.env` files are gitignored; `packages/db/.env.example` is the reference.

`pnpm --filter api start` sets no `NODE_ENV`, so it refuses to start
("A real Mailer must be configured…") until a real `Mailer` is wired into
`server.ts`. That is intentional: a deployment must never log password-reset
links to the console.

## Deploying

Production layout: nginx in front, three upstream roles.

- `/api/` and `/uploads/` go straight to Fastify.
- `/` goes to Next, started with `API_PROXY=off` (nginx does the proxying the
  dev rewrites do locally). Set `API_INTERNAL_URL` to Fastify's address.
- Fastify and Next are not public: reachable only through nginx.
- **`TRUSTED_PROXY`** must list nginx's address **and the Next server's**.
  Both connect to the API; listing only nginx would put every Server Action
  (sign-in included) in one shared rate-limit bucket, because the Next server
  would be seen as a single client.
- nginx appends the client IP with `$proxy_add_x_forwarded_for`. Never pass a
  client-supplied `X-Forwarded-For` through unchanged.
- **`WEB_ORIGIN`** is the public `https://` origin. It drives the Origin check,
  email links and the `Secure` flag of the session cookie.
- **Cookies need no nginx config.** The API sets `sid` without `Domain`, so
  the browser binds it to the public host; nginx passes `Cookie`/`Set-Cookie`
  through unchanged.
- **`NODE_ENV`** should be `production`. Unset also fails closed, but
  `production` is what other tooling (Prisma, the seed guard) recognises.

Two must-dos:

1. Pass `Host $host` to Next. Server Actions compare `Origin` with `Host` and
   reject every action otherwise. If the public host differs from what Next
   sees, set `serverActions.allowedOrigins`.
2. Never cache `/api` responses in nginx: a cached `Set-Cookie` would hand one
   user's session to another. Only `/uploads` may be cached.

```nginx
server {
    listen 443 ssl;
    server_name app.example.com;

    client_max_body_size 5m; # image uploads

    location /api/ {
        proxy_pass http://api:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://api:4000;
    }

    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Cross-origin access

The browser reaches the API only on the web origin (dev: Next rewrites; prod:
nginx), so the API registers no CORS. The API trusts `X-Forwarded-For` only
from `TRUSTED_PROXY`.

Known follow-up: the `@fastify/cors` dependency is still listed in
`apps/api/package.json` although nothing registers it; remove it.
