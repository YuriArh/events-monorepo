# syntax=docker/dockerfile:1
#
# Web image (Next.js, standalone output). Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg SITE_URL=https://app.example.com .
#
# Next bakes rewrites() and metadataBase into the build, so the three build
# arguments below are part of the image, not of the container's environment.

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
RUN turbo prune web --docker

# ── installer ─────────────────────────────────────────────────────────────
FROM base AS installer
COPY --from=pruner /app/out/json/ .
# The lockfile starts with a second document that pnpm 11+ writes to pin pnpm
# itself; pnpm 10 cannot parse it ("expected a single document") and does not
# need it to install. Drop it when present.
RUN [ "$(grep -c '^---$' pnpm-lock.yaml)" = 2 ] \
    && awk '/^---$/{n++;next} n>=2' pnpm-lock.yaml > lock.tmp && mv lock.tmp pnpm-lock.yaml \
    || true
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store
COPY --from=pruner /app/out/full/ .

# Behind a reverse proxy (Traefik/Dokploy) the proxy routes /api and /uploads
# to the API itself, so Next must not rewrite them: API_PROXY=off.
# API_INTERNAL_URL is where the Next *server* reaches the API (the compose
# service name). SITE_URL is the public https:// origin.
ARG API_PROXY=off
ARG API_INTERNAL_URL=http://api:4000
ARG SITE_URL
RUN test -n "$SITE_URL" || (echo "build-arg SITE_URL is required (the public https:// origin)" && exit 1)
ENV API_PROXY=$API_PROXY \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    SITE_URL=$SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=web

# ── runner ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
ARG API_INTERNAL_URL=http://api:4000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    API_INTERNAL_URL=$API_INTERNAL_URL
WORKDIR /app
# standalone keeps the monorepo layout: the server is apps/web/server.js, and
# static assets and public/ are not traced into it, so they are copied beside it.
COPY --from=installer --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=installer --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
