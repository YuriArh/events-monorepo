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
  exists (`@repo/contracts`, `shared/*` helpers, shared components) before adding a
  near-copy; extract once a second real use appears.
- **Server rendering first** — in `apps/web`, every page is a Server Component
  and its HTML arrives with the data in it. Events and the current user are
  always fetched on the server **into the TanStack Query cache** (prefetch +
  `HydrationBoundary`) and read on the client with `useQuery` using the shared
  query options in the module's `*.queries.ts` — never fetched only on the client.
  `"use client"` goes on the smallest component that needs the browser.
- **Mutations** — simple forms use Server Actions (`useActionState`);
  complex interactive forms use TanStack Form + TanStack Query mutations
  through the `/api` proxy, then invalidate the affected queries.
- **Modular architecture** — code is grouped by feature, not by file kind.
  Each feature in `apps/api/src/modules/<feature>/` (`auth`, `users`,
  `events`, `geocoding`) and `apps/web/app/modules/<feature>/` (`auth`,
  `account`, `events`, `geocoding`) owns its code — on the web: its API calls,
  queries, actions, helpers and components; cross-cutting code goes to
  `apps/web/app/shared/` (`api/` — the HTTP client, `query/`, `forms/`, `ui/`,
  `lib/`) or `apps/api/src/lib/`. Dependencies point one way: routes →
  modules → shared; `shared/` never imports a module. Route folders in
  `apps/web/app` only compose modules. A new feature is a new module; no new
  top-level `lib/`, `actions/` or `components/` buckets. Details and file
  naming: [docs/architecture.md](docs/architecture.md#web-modules).

Before writing code, read the conventions that apply:

- [docs/architecture.md](docs/architecture.md) — layout, layering, data flow
- [docs/authentication.md](docs/authentication.md) — sessions, guards, ownership, CSRF, rate limits

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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
