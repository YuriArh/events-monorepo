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
browser → TanStack Query → app/lib/events.ts (fetch)
        → Fastify route → service → repository → Prisma → Postgres
```

The web app talks to the API over HTTP; it does not import `@repo/db`. Only
`apps/api` touches the database.

## Web app routes

- `/` — the event list.
- `/events/new` — create form.
- `/events/[id]/edit` — edit form, including updating the linked venue
  (`Address`) in place.

Create and edit are full routes, not a dialog over the list page: the list's
"New Event" and per-row edit controls are links (`next/link`), not buttons
that open a modal. Only the delete confirmation is a dialog, since it doesn't
need a form.

## API module layering

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

`buildApp()` in `apps/api/src/app.ts` constructs the Fastify instance and is
exported separately from `server.ts` (which listens), so tests can call
`app.inject()` without binding a port.

## Shared contracts

Request validation lives in `@repo/contracts`, not in either app. The package
exports two schemas per resource, derived from one field shape: a wire schema
(ISO date strings) that the browser form validates against, and a payload schema
(coerced `Date` objects) that the API parses request bodies with. The API's
`*.schema.ts` files are thin re-exports, so the module layering is unchanged.

The server remains authoritative. Client-side validation is a UX improvement,
never the security boundary.

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
| `NEXT_PUBLIC_API_URL` | web      | `apps/web/.env.local`, defaults to :4000   |

`.env` files are gitignored; `packages/db/.env.example` is the reference.

## CORS

The API allows exactly the web origin and the methods actually in use
(`GET, POST, PATCH, DELETE`). `@fastify/cors` defaults to `GET,HEAD,POST`, so
any new method must be added explicitly or the browser will block it while
curl keeps working. There is a regression test for this.
