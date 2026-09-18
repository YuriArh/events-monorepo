# Architecture

## Layout

```
apps/
  web/        Next.js 16 (App Router, Turbopack), React 19, StyleX, TanStack Query
  api/        Fastify 5, Zod validation
  e2e/        Playwright suite covering both apps
packages/
  db/         Prisma client + schema, exported as @repo/db
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

## Error handling

Routes translate domain errors into responses. The global error handler in
`app.ts` is the safety net:

- `ZodError` → 400 with the issue list
- any error carrying a 4xx `statusCode` (Fastify's own) → passed through
- everything else → 500, logged

Do not let the handler swallow a client error as a 500 — that once masked a
malformed-request bug as a server fault.

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
