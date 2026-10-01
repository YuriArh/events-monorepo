# eventapp

Monorepo for searching events applications
pnpm + Turborepo monorepo. Next.js web app, Fastify API, Prisma/Postgres.

```bash
docker compose up -d   # Postgres (required by the API and tests)
pnpm dev               # all apps — web :3000, api :4000
pnpm check-types && pnpm lint && pnpm test
pnpm test:e2e          # Playwright, boots both apps
```

# Principles

- **KISS** — pick the simplest design that meets the requirement. No speculative
  options, layers or abstractions "for later".
- **DRY** — one source of truth for each rule, shape and piece of UI. Reuse what
  exists (`@repo/contracts`, `lib/*` helpers, shared components) before adding a
  near-copy; extract once a second real use appears.
- **Server rendering first** — in `apps/web`, pages and components are Server
  Components by default. Fetch data on the server and render HTML there. Add
  `"use client"` only to the smallest island that genuinely needs the browser
  (state, effects, event handlers, the viewer's session or time zone).

Before writing code, read the conventions that apply:

- [docs/architecture.md](docs/architecture.md) — layout, layering, data flow

# Typescript convections

- [docs/typescript-conventions.md](docs/typescript-conventions.md) — for detailed tupescript convections

# CSS convections

- [docs/css-conventions.md](docs/css-conventions.md) — StyleX only, no Tailwind — for detailed styling convections

# Testing convections

- [docs/testing-conventions.md](docs/testing-conventions.md) — for detailed testing convections
- [docs/superpowers/specs/](docs/superpowers/specs/) — design specs for larger features

Two rules worth knowing up front: styling is StyleX (Tailwind was removed
deliberately), and `apps/web/app/components/ui/**` is vendored registry code —
regenerate it, don't hand-edit it.
