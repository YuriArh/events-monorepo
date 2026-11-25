# syntax=docker/dockerfile:1
#
# API image. Build from the repository root (the context must hold the whole
# monorepo):  docker build -f apps/api/Dockerfile .
#
# Stages: pruner → installer → { migrate | runner }
#   pruner     turbo prune: only the API and the packages it depends on
#   installer  install dependencies, generate the Prisma client, bundle the API
#   migrate    one-off job: prisma migrate deploy (needs the Prisma CLI)
#   runner     the image that runs: one JS file + the native argon2 addon

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.15.1
ARG TURBO_VERSION=2.10.13

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
ENV PNPM_HOME=/pnpm CI=true
WORKDIR /app

# ── pruner ────────────────────────────────────────────────────────────────
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune api --docker

# ── installer ─────────────────────────────────────────────────────────────
FROM base AS installer
# Manifests and lockfile first: this layer is rebuilt only when dependencies change.
COPY --from=pruner /app/out/json/ .
# The lockfile starts with a second document that pnpm 11+ writes to pin pnpm
# itself; pnpm 10 cannot parse it ("expected a single document") and does not
# need it to install. Drop it when present.
RUN [ "$(grep -c '^---$' pnpm-lock.yaml)" = 2 ] \
    && awk '/^---$/{n++;next} n>=2' pnpm-lock.yaml > lock.tmp && mv lock.tmp pnpm-lock.yaml \
    || true
# --ignore-scripts: @repo/db's postinstall runs `prisma generate`, but the
# schema is not copied yet. It runs explicitly below.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store
COPY --from=pruner /app/out/full/ .
# prisma.config.ts insists on DATABASE_URL even though `generate` never connects.
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused pnpm --filter @repo/db exec prisma generate
RUN pnpm turbo run build --filter=api
# Runtime dependencies only: with everything else bundled, that is just argon2.
RUN pnpm --filter api deploy --legacy --prod /prod

# ── migrate ───────────────────────────────────────────────────────────────
FROM installer AS migrate
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── runner ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOADS_DIR=/data/uploads
WORKDIR /app
RUN mkdir -p "$UPLOADS_DIR" && chown node:node "$UPLOADS_DIR"
# package.json carries "type": "module", which makes server.js an ES module.
COPY --from=installer --chown=node:node /prod/package.json ./package.json
COPY --from=installer --chown=node:node /prod/node_modules ./node_modules
COPY --from=installer --chown=node:node /app/apps/api/dist/server.js ./server.js
USER node
EXPOSE 4000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
