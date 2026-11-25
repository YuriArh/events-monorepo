# Deploying with Docker (Dokploy / Traefik)

Two images, one compose file, no reverse proxy of our own: TLS and routing are
Traefik's job (Dokploy ships one). The routing rules and env variables are the
ones in [architecture.md → Deploying](architecture.md#deploying); this page is
what changes in containers. The nginx-on-a-bare-server alternative is
[deployment.md](deployment.md).

## What is in the box

| File                          | Purpose                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `apps/api/Dockerfile`         | API image. Stages `pruner → installer → migrate \| runner`           |
| `apps/web/Dockerfile`         | Web image (Next standalone). Stages `pruner → installer → runner`    |
| `docker-compose.prod.yml`     | `postgres`, `migrate` (one-off), `api`, `web`                        |
| `.env.prod.example`           | The three variables compose reads                                    |
| `.dockerignore`               | Keeps `node_modules`, `.env*`, docs and git out of the build context |
| `apps/api/esbuild.config.mjs` | Bundles the API into `dist/server.js`                                |

`docker-compose.yml` (Postgres only) stays the **development** database.

### How the images stay small

- **`turbo prune <app> --docker`** copies only the app and the workspace
  packages it depends on. Manifests and lockfile go in first, so the
  `pnpm install` layer is cached until a dependency changes
  ([Turborepo's Docker guide](https://turborepo.com/docs/guides/tools/docker)).
- **API: bundle, not `tsx`.** esbuild folds the API, `@repo/*` (which export
  TypeScript source), every npm dependency and the Prisma client (its WASM
  query compiler is embedded) into one `server.js`, run by plain `node`.
  `argon2` is the one external: a native addon that loads its prebuilt binary
  from its own folder. `pnpm deploy --prod` installs just that, so the runtime
  `node_modules` is ~5 MB. This is why `apps/api/package.json` lists only
  `argon2` under `dependencies`: **anything the bundle includes belongs in
  `devDependencies`**; add a runtime dependency only if esbuild must leave it
  external (then also add it to `external` in the esbuild config).
- **Web: `output: "standalone"`** traces only the files the server needs
  (~40 MB instead of the full `node_modules`). Static assets and `public/` are
  copied beside it by the Dockerfile.
- Alpine base, non-root `node` user, a healthcheck on each service.

Measured: API image ≈ 250 MB, web ≈ 325 MB (uncompressed, including the Node
base image).

## Build-time vs run-time settings

Next bakes `rewrites()` and `metadataBase` into the build, so for **web** these
are build arguments (compose passes them), not container env:

| Build arg          | Value in compose           | Why                                                   |
| ------------------ | -------------------------- | ----------------------------------------------------- |
| `SITE_URL`         | `${SITE_URL}` (required)   | `metadataBase`, the public `https://` origin          |
| `API_PROXY`        | `off` (Dockerfile default) | The proxy routes `/api` and `/uploads`, Next must not |
| `API_INTERNAL_URL` | `http://api:4000`          | Where the Next _server_ reaches the API               |

Changing `SITE_URL` means **rebuilding** the web image. The API reads its
settings at run time: `DATABASE_URL`, `WEB_ORIGIN` (= `SITE_URL`) and
`TRUSTED_PROXY` are set in the compose file.

**`TRUSTED_PROXY`** must cover the proxy (Traefik) **and** the web container,
because both connect to the API. Their addresses change between deploys, so
the default is the private Docker ranges (`10/8`, `172.16/12`, `192.168/16`).
That is safe because the API publishes no port: only containers on the Docker
networks can reach it. Narrow it if other, less trusted containers share the
network.

## Run it with plain Compose

```bash
cp .env.prod.example .env.prod      # set SITE_URL and POSTGRES_PASSWORD
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Order is enforced: `postgres` healthy → `migrate` (`prisma migrate deploy`)
exits 0 → `api` healthy → `web`. Nothing publishes a port, so put a proxy in
front (next section) or add `ports:` for a local check.

Volumes: `postgres-data` (database) and `uploads` (event images) — **back up
both**.

## Deploy on Dokploy

1. Create a **Compose** service from the Git repository, compose path
   `docker-compose.prod.yml`.
2. Environment tab: `SITE_URL`, `POSTGRES_PASSWORD` (see `.env.prod.example`).
3. Domains tab — both on the same host (the browser must see one origin):

   | Service | Port | Path       | Strip path |
   | ------- | ---- | ---------- | ---------- |
   | `web`   | 3000 | `/`        | off        |
   | `api`   | 4000 | `/api`     | off        |
   | `api`   | 4000 | `/uploads` | off        |

   Enable HTTPS (Let's Encrypt). The API keeps the full `/api/...` path, so
   _Strip path_ must stay off. Traefik prefers the longer rule, so `/api` and
   `/uploads` win over `/`.

4. Deploy. Domain changes need a redeploy: Traefik reads labels from the
   containers.

Dokploy adds the Traefik labels and joins the services to its network itself,
which is why the compose file has none. Not verified end to end: the compose
file was run locally, but not on a Dokploy instance. If Dokploy's path routing
misbehaves, the fallback is to run the stack as-is and add Traefik labels by
hand: a router `Host(<host>) && (PathPrefix(/api) || PathPrefix(/uploads))` to
`api:4000`, and `Host(<host>)` to `web:3000`.

Two must-dos from the architecture still apply behind Traefik:

- Pass the original `Host` to Next (Traefik does by default); Server Actions
  compare it with `Origin`.
- Don't cache `/api` responses anywhere (a cached `Set-Cookie` would hand one
  user's session to another).

## Before the first real deploy

1. **A real mailer.** The API image runs with `NODE_ENV=production` and
   refuses to start without an injected `Mailer` (see
   [deployment.md](deployment.md) blocker 1). Until one is wired in
   `apps/api/src/server.ts`, the `api` container exits at start.
2. **Request body limit.** Uploads are capped by the API at 5 MB
   (`MAX_UPLOAD_BYTES`); Traefik has no default body limit, so nothing to set.
3. **Lockfile.** `pnpm-lock.yaml` starts with an extra document that pnpm 11+
   writes to pin pnpm itself. pnpm 10.15.1 inside the image cannot parse it, so
   both Dockerfiles drop it before `pnpm install` (a no-op if it is absent).

## Alternatives to Dokploy

All run Docker Compose projects behind their own proxy, so these files work
with any of them:

- **Coolify** — the most widely used; larger one-click catalogue, native
  Compose, drives Docker over SSH.
- **CapRover** — oldest and stable, but slower development.
- **Dokku** — git-push deploys, minimal, CLI only.
- **Plain Compose + Caddy** — least moving parts: add a `caddy` service with
  the same two routes; it gets certificates on its own.

Comparison sources are blog posts, not benchmarks; pick by which UI you like.
