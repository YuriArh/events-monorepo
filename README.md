# eventapp

A web app for publishing and discovering events. Organizers sign up, create
events with a cover image, a time and an address (picked from an address
search), and manage them. Anyone can browse the list and open an event to see
its details, organizer and venue on a map.

It is a pnpm + Turborepo monorepo: a server-rendered **Next.js** web app, a
**Fastify** API and a **Postgres** database accessed through **Prisma**.

## Goal

A small, well-structured foundation for an events search product, built to
keep the codebase simple as it grows: feature modules instead of file-kind
buckets, one source of truth for shared rules (`@repo/contracts`), pages that
arrive with their data already rendered, and tests that exercise real
boundaries (HTTP, database, browser) rather than mocks.

## Status

Working today:

- **Events** — list, detail page (viewer's time zone, venue map), create, edit
  and delete for the organizer or an admin, cover image upload (JPEG, PNG,
  WebP, GIF up to 5 MB).
- **Address autocomplete** — type-ahead through [Photon](https://photon.komoot.io)
  (OpenStreetMap data), proxied by the API; coordinates are stored with the
  address.
- **Accounts** — email + password sign-up and sign-in, server-side sessions,
  password reset and email verification by link, profile rename, password
  change, sign out everywhere, account deletion.
- **Security basics** — argon2id, opaque session tokens stored only as hashes,
  CSRF defence (SameSite + Origin check), per-route rate limits. See
  [docs/authentication.md](docs/authentication.md) and the
  [auth audit](docs/audits/2026-10-17-auth-audit.md).
- **Deployment** — Docker images, a production compose file, Dokploy/Traefik
  guide.

Not built yet: searching and filtering the event list, categories, a real
email provider (see [Before deploying](#before-deploying)), OAuth, 2FA. The
out-of-scope lists in [docs/superpowers/specs](docs/superpowers/specs) record
what was left out on purpose.

## Tech stack

| Area     | Choice                                                                               |
| -------- | ------------------------------------------------------------------------------------ |
| Monorepo | pnpm workspaces, Turborepo                                                           |
| Web      | Next.js 16 (App Router, Turbopack), React 19, StyleX, TanStack Query + Form, Base UI |
| API      | Fastify 5, Zod validation, argon2                                                    |
| Data     | PostgreSQL 17, Prisma 7 (`@prisma/adapter-pg`)                                       |
| Shared   | `@repo/contracts` (Zod schemas used by API and web), `@repo/db` (Prisma client)      |
| Tests    | Vitest (unit + API integration against a real database), Playwright (end to end)     |
| Tooling  | TypeScript, Biome, Prettier                                                          |

## Repository layout

```
apps/
  web/        Next.js app: routes compose feature modules (app/modules/*)
  api/        Fastify API: feature modules (src/modules/*), plugins, lib
  e2e/        Playwright suite that boots both apps
packages/
  db/         Prisma schema, migrations, seed, generated client (@repo/db)
  contracts/  Zod schemas shared by API and web (@repo/contracts)
  ui/         Shared React components (not yet used by web)
  eslint-config/, typescript-config/   Shared config
docs/         Architecture, conventions, specs, plans, audit, deployment
```

How the pieces fit: the browser only talks to the web origin. In development
Next rewrites `/api` and `/uploads` to Fastify; in production the reverse
proxy does. Server Components and Server Actions call the API directly,
forwarding the visitor's cookie. Details in
[docs/architecture.md](docs/architecture.md).

## Getting started

### Prerequisites

- **Node.js 24 or newer** (`engines` in `package.json`).
- **pnpm.** The repo pins `pnpm@10.15.1`. The lockfile has an extra leading
  document written by pnpm 11+, which plain 10.15.1 cannot read, so use a
  recent pnpm (for example 12) as the launcher: it installs and runs the pinned
  version itself.
- **Docker**, for Postgres.

### Run it

```bash
# 1. Install dependencies (also generates the Prisma client)
pnpm install

# 2. Start Postgres (port 5432)
docker compose up -d

# 3. Point the API and Prisma at the dev database
cp packages/db/.env.example packages/db/.env
cp packages/db/.env.example apps/api/.env

# 4. Create the tables
pnpm --filter @repo/db exec prisma migrate deploy

# 5. (optional) sample data: an admin, a regular user and a few events
pnpm --filter @repo/db db:seed

# 6. Start everything
pnpm dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:4000> (`GET /health`)

The seed creates `admin@example.test` and `user@example.test`, both with the
password `password123`. It wipes users, events and addresses and refuses to run
in production or against a non-local database.

In development outgoing emails (verification and reset links) are printed to
the API log instead of being sent.

### Commands

| Command                             | What it does                                            |
| ----------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                          | Web and API with hot reload                             |
| `pnpm build`                        | Build every app and package                             |
| `pnpm check-types`                  | TypeScript across the monorepo                          |
| `pnpm lint`                         | Biome (and ESLint in `packages/ui`)                     |
| `pnpm test`                         | Vitest: unit and API integration tests (needs Postgres) |
| `pnpm test:e2e`                     | Playwright: boots web and API itself                    |
| `pnpm format`                       | Prettier                                                |
| `pnpm --filter @repo/db db:studio`  | Prisma Studio                                           |
| `pnpm --filter @repo/db db:migrate` | Create a new migration (`prisma migrate dev`)           |

Run these before opening a PR: `pnpm check-types && pnpm lint && pnpm test`.

### Tests

API tests run against a real database named `eventapp_test` on the same
Postgres container. `pnpm test` migrates it first; if it does not exist yet,
create it once:

```bash
docker compose exec postgres createdb -U postgres eventapp_test
```

For the first end-to-end run, install the Playwright browsers:

```bash
pnpm --filter e2e exec playwright install
```

See [docs/testing-conventions.md](docs/testing-conventions.md).

## Configuration

Development needs only `DATABASE_URL` (steps above). Everything else has a
development default. Variables you may set:

| Variable           | Used by | Purpose                                                                                                                  |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`     | api, db | Postgres connection string                                                                                               |
| `WEB_ORIGIN`       | api     | Public origin of the web app: Origin check, email links, `Secure` cookie when `https:` (default `http://localhost:3000`) |
| `TRUSTED_PROXY`    | api     | Addresses whose `X-Forwarded-For` is trusted (default loopback)                                                          |
| `UPLOADS_DIR`      | api     | Where uploaded images are stored (default `apps/api/uploads`)                                                            |
| `PHOTON_URL`       | api     | Geocoder base URL (default the public Photon instance)                                                                   |
| `PORT`             | api     | API port (default `4000`)                                                                                                |
| `API_INTERNAL_URL` | web     | Where the Next server reaches the API (default `http://localhost:4000`)                                                  |
| `API_PROXY`        | web     | `off` disables the dev rewrites of `/api` and `/uploads`; set at build time behind a proxy                               |
| `SITE_URL`         | web     | Public URL used for metadata (default `http://localhost:3000`)                                                           |
| `NODE_ENV`         | api, db | `development`/`test` allow the console mailer; anything else requires a real one                                         |

The full table, including build-time versus run-time behaviour, is in
[docs/architecture.md](docs/architecture.md#environment).

## API at a glance

All routes are under `/api`. Writes require a session cookie and a matching
`Origin`.

| Area      | Endpoints                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth      | `POST /auth/register`, `login`, `logout`, `logout-all`, `GET /auth/me`, `POST /auth/password/{change,forgot,reset}`, `POST /auth/email/{verify,resend}` |
| Users     | `PATCH /users/me` (rename), `DELETE /users/me` (delete account)                                                                                         |
| Events    | `GET /events`, `GET /events/:id`, `POST /events`, `PATCH /events/:id`, `DELETE /events/:id`, `POST /events/upload`                                      |
| Geocoding | `GET /geocode?q=…` (Photon proxy)                                                                                                                       |

Uploaded images are served from `/uploads/<key>`.

## Architecture in short

- **Server rendering first.** Every web page is a Server Component whose HTML
  arrives with its data. Events and the current user are prefetched on the
  server into the TanStack Query cache, hydrated on the client and read with
  `useQuery`.
- **Mutations.** Simple forms are Server Actions (`useActionState`); the
  interactive event form uses TanStack Form with Query mutations.
- **Modules, not buckets.** Each feature owns its code in
  `apps/api/src/modules/<feature>` and `apps/web/app/modules/<feature>`. Other
  code imports only a module's `index.ts`. Dependencies point one way:
  routes → modules → shared.
- **Styling is StyleX only** (Tailwind was removed on purpose).
  `apps/web/app/components/ui/**` is vendored registry code: regenerate it,
  don't edit it by hand.

Before writing code, read the conventions that apply:

- [docs/architecture.md](docs/architecture.md) — layout, layering, data flow
- [docs/authentication.md](docs/authentication.md) — sessions, guards, CSRF, rate limits
- [docs/typescript-conventions.md](docs/typescript-conventions.md)
- [docs/css-conventions.md](docs/css-conventions.md)
- [docs/testing-conventions.md](docs/testing-conventions.md)
- [docs/superpowers/specs](docs/superpowers/specs) — design specs of larger features, with plans next to them

`CLAUDE.md` and `AGENTS.md` carry the same rules for AI coding agents.

## Deployment

The API is bundled with esbuild into one file and the web app is built as a
Next standalone server; both ship as Docker images behind a reverse proxy.

- [docs/docker-deployment.md](docs/docker-deployment.md) — images, the
  production compose file (`docker-compose.prod.yml`), Dokploy and Traefik
- [docs/deployment.md](docs/deployment.md) — the alternative without
  containers: systemd and nginx on one server

### Before deploying

- **Wire a real mailer.** In production the API refuses to start without an
  injected `Mailer` (SMTP or a provider), so password-reset links are never
  logged. Implement the `Mailer` interface in `apps/api/src/lib/mailer.ts` and
  pass it to `buildApp({ mailer })` in `apps/api/src/server.ts`.
- Set `SITE_URL` and `POSTGRES_PASSWORD` (see `.env.prod.example`) and back up
  the database and uploads volumes.
- Known open items from the security audit are listed in
  [docs/audits/2026-10-17-auth-audit.md](docs/audits/2026-10-17-auth-audit.md).
