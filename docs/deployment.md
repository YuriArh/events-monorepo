# Deploying to a server

How to run eventapp on one Linux server behind nginx: Postgres, the Fastify
API, the Next.js web app and nginx on the same machine. The rules behind each
step (why nginx routes `/api` itself, who `TRUSTED_PROXY` must list) are in
[architecture.md → Deploying](architecture.md#deploying); this page is the
recipe.

```
                 ┌──────────────────────── server ────────────────────────┐
 browser ─https─▶│ nginx :443 ─┬─ /api/*, /uploads/* ─▶ Fastify 127.0.0.1:4000 ─▶ Postgres :5432
                 │             └─ everything else ────▶ Next    127.0.0.1:3000 ─┘ (Server Components,
                 │                                                               Server Actions call
                 │                                                               the API directly)
                 └─────────────────────────────────────────────────────────┘
```

Only nginx is reachable from outside. The browser sees one origin, so the
`sid` session cookie needs no `Domain` and no CORS is involved.

## Before you start: three blockers

Fix these first, or the deployment will not run.

1. **A real mailer.** The API refuses to start outside `development`/`test`:
   `A real Mailer must be configured unless NODE_ENV is development or test`.
   This is deliberate: the console mailer would print password-reset links to
   the log. Wire an SMTP or provider-backed `Mailer` into
   `apps/api/src/server.ts` (`buildApp({ mailer })`) before deploying.
2. **Run the API with `tsx`, not `node`.** The workspace packages
   (`@repo/db`, `@repo/contracts`) export TypeScript source, and the generated
   Prisma client resolves its runtime only under `tsx`. Plain
   `node dist/server.js` — which is what `pnpm --filter api start` runs today —
   fails with `Unknown file extension ".ts"`, and with type stripping enabled
   (the Node 24 default) with `Cannot find module
   '@prisma/client-runtime-utils'`. `tsx` is a dev dependency, so install
   dependencies **without** `--prod`. (Follow-up: change the `start` script,
   or bundle the API.)
3. **The pnpm that wrote the lockfile.** `pnpm-lock.yaml` is in the
   two-document format of newer pnpm, which `pnpm@10.15.1` (the
   `packageManager` field) cannot read. Install the same pnpm version you use
   locally (`pnpm --version`), or update `packageManager` so Corepack picks it.

## 1. Prepare the server

Ubuntu/Debian shown; adapt package names elsewhere.

```bash
# Node 24 (root package.json: "engines": { "node": ">=24" })
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx postgresql certbot python3-certbot-nginx
sudo npm install -g pnpm@<your local pnpm version>

# A system user that owns the app and its uploads
sudo useradd --system --create-home --home-dir /srv/eventapp eventapp
sudo mkdir -p /var/lib/eventapp/uploads
sudo chown eventapp: /var/lib/eventapp/uploads

# Firewall: only SSH and nginx are public. Fastify listens on 0.0.0.0
# (apps/api/src/server.ts), so the firewall is what keeps :4000 private.
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Postgres: create a database and a user with a real password (the
`docker-compose.yml` credentials are for development only).

```bash
sudo -u postgres psql -c "create user eventapp with password '<strong password>';"
sudo -u postgres psql -c "create database eventapp owner eventapp;"
```

## 2. Get the code and install

```bash
sudo -iu eventapp
git clone <repo url> /srv/eventapp/app
cd /srv/eventapp/app
pnpm install --frozen-lockfile   # also runs `prisma generate` (packages/db postinstall)
```

## 3. Configure the environment

All variables are described in
[architecture.md → Environment](architecture.md#environment). For this
single-server layout:

**`apps/api/.env`** (read by the API via `--env-file`):

```bash
NODE_ENV=production
DATABASE_URL=postgresql://eventapp:<password>@127.0.0.1:5432/eventapp?schema=public
WEB_ORIGIN=https://app.example.com      # public origin: Origin check, email links, Secure cookie
TRUSTED_PROXY=127.0.0.1,::1             # nginx AND the Next server — both on this host
UPLOADS_DIR=/var/lib/eventapp/uploads   # absolute: survives redeploys; back it up
PORT=4000
# Never set RATE_LIMITS=off here — it exists for the e2e suite only.
```

**`packages/db/.env`** (read by the Prisma CLI for migrations):

```bash
DATABASE_URL=postgresql://eventapp:<password>@127.0.0.1:5432/eventapp?schema=public
```

**Web** — needed both when building and when starting (see the next step):

```bash
API_PROXY=off                          # nginx routes /api and /uploads, not Next
API_INTERNAL_URL=http://127.0.0.1:4000 # where Next's server code reaches Fastify
SITE_URL=https://app.example.com       # metadataBase (absolute OG/canonical URLs)
```

Keep the `.env` files readable only by the `eventapp` user (`chmod 600`).

`TRUSTED_PROXY` must cover **both** nginx and the Next server, because both
open connections to the API. On one host both arrive from loopback, so
`127.0.0.1,::1` is right. If you later move Next or nginx to another machine,
list that machine's address too — otherwise every Server Action (sign-in
included) shares one rate-limit bucket.

## 4. Migrate and build

```bash
cd /srv/eventapp/app
pnpm --filter @repo/db exec prisma migrate deploy
API_PROXY=off API_INTERNAL_URL=http://127.0.0.1:4000 SITE_URL=https://app.example.com \
    pnpm build
```

The web variables must be set **for `pnpm build`**: Next bakes `rewrites()`
into the build at `next build`, and `next start` never re-reads them. Turbo
passes them through because `apps/web/turbo.json` declares them.

Never run the seed (`db:seed`) against production; with
`NODE_ENV=production` it refuses anyway.

## 5. Run both apps with systemd

`/etc/systemd/system/eventapp-api.service`:

```ini
[Unit]
Description=eventapp API (Fastify)
After=network.target postgresql.service

[Service]
User=eventapp
WorkingDirectory=/srv/eventapp/app/apps/api
ExecStart=/srv/eventapp/app/apps/api/node_modules/.bin/tsx --env-file=.env dist/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/eventapp-web.service`:

```ini
[Unit]
Description=eventapp web (Next.js)
After=network.target eventapp-api.service

[Service]
User=eventapp
WorkingDirectory=/srv/eventapp/app/apps/web
Environment=NODE_ENV=production
Environment=API_PROXY=off
Environment=API_INTERNAL_URL=http://127.0.0.1:4000
Environment=SITE_URL=https://app.example.com
ExecStart=/srv/eventapp/app/apps/web/node_modules/.bin/next start -H 127.0.0.1 -p 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`-H 127.0.0.1` keeps Next off the public interface even without the firewall.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now eventapp-api eventapp-web
journalctl -u eventapp-api -u eventapp-web -f
```

## 6. Configure nginx

`/etc/nginx/sites-available/eventapp` (then
`sudo ln -s /etc/nginx/sites-available/eventapp /etc/nginx/sites-enabled/`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name app.example.com;

    # Filled in by certbot (step 7).
    # ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    client_max_body_size 5m; # event images: the API's limit is 5 MB (MAX_UPLOAD_BYTES)

    # API: straight to Fastify. Never cache — a cached Set-Cookie would hand
    # one user's session to another.
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }

    # Uploaded images: also Fastify. Image keys are random, so caching is safe.
    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        expires 7d;
    }

    # Everything else: Next (pages and Server Actions).
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host; # Server Actions compare Origin with Host
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

What each line protects:

| Setting | Why |
| --- | --- |
| `proxy_set_header Host $host` on `/` | Next rejects every Server Action whose `Origin` doesn't match the host it sees. If the public host must differ, set `serverActions.allowedOrigins` in `next.config.js` instead. |
| `$proxy_add_x_forwarded_for` | Appends the real client IP to whatever the client sent. The API trusts only the hops listed in `TRUSTED_PROXY`, so a forged header can't dodge rate limits. Never pass `$http_x_forwarded_for` through unchanged. |
| No caching on `/api/` | Responses carry `Set-Cookie` and per-user data. |
| `client_max_body_size 5m` | nginx's default 1 MB would reject image uploads before the API sees them. |
| No cookie settings | The API sets `sid` without `Domain`, so the browser binds it to the public host; nginx passes `Cookie`/`Set-Cookie` as is. The `Secure` flag comes from `WEB_ORIGIN` being `https://`. |

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 7. HTTPS

```bash
sudo certbot --nginx -d app.example.com
```

Certbot fills in the certificate lines and installs a renewal timer. `WEB_ORIGIN`
and `SITE_URL` must be the `https://` origin; with `http://` the session cookie
would not be `Secure`.

## 8. Check the deployment

```bash
curl -sI https://app.example.com/ | head -1                      # 200 — rendered by Next
curl -s  https://app.example.com/api/events | head -c 80          # JSON from Fastify via nginx
curl -s  -o /dev/null -w '%{http_code} %{redirect_url}\n' \
         https://app.example.com/account                          # 307 …/login?next=%2Faccount
curl -s  -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/events  # on the server: 200
curl -s  -m 3 -o /dev/null -w '%{http_code}\n' http://app.example.com:4000/ # from outside: must time out
```

Then in a browser: register, sign in, create an event with an image, sign out.
If signing in shows a banner instead of redirecting, see Troubleshooting.

## Updating

```bash
sudo -iu eventapp
cd /srv/eventapp/app
git pull
pnpm install --frozen-lockfile
pnpm --filter @repo/db exec prisma migrate deploy
API_PROXY=off API_INTERNAL_URL=http://127.0.0.1:4000 SITE_URL=https://app.example.com pnpm build
exit
sudo systemctl restart eventapp-api eventapp-web
```

Migrations run before the new code starts; write them so the previous release
still works against the migrated schema while the restart happens.

## Backups

Two things hold state: the Postgres database (`pg_dump eventapp`) and
`UPLOADS_DIR` (event images; the database stores only their keys). Back up
both, together.

## Using Traefik instead of nginx

Nothing in the app is nginx-specific; the same four rules apply to any proxy:
route `/api` and `/uploads` to Fastify and everything else to Next, pass the
original `Host` to Next, append (never forward unchecked) `X-Forwarded-For`,
and don't cache `/api`. In Traefik that is two routers (`PathPrefix(`/api`) ||
PathPrefix(`/uploads`)` with a higher priority, and a catch-all) — `Host` is
passed by default (`passHostHeader`), and Traefik sets `X-Forwarded-For`
itself, discarding a client's value unless its entrypoint lists
`forwardedHeaders.trustedIPs`. Add a buffering middleware with
`maxRequestBodyBytes: 5242880` for the upload limit. Traefik pays off mainly
when the apps run as Docker containers (routing via labels, built-in
Let's Encrypt); this repo ships no Dockerfiles, so nginx + certbot is simpler
today.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| API exits: `A real Mailer must be configured…` | Blocker 1: no production mailer wired in. |
| API exits: `Unknown file extension ".ts"` or `Cannot find module '@prisma/client-runtime-utils'` | Blocker 2: started with `node`; use `tsx`. |
| Sign-in and every other form fail; Next logs that the `Origin` header doesn't match the host | nginx doesn't pass `Host $host` to Next, or the public host differs (`serverActions.allowedOrigins`). |
| Pages error or render without data; Next logs `ECONNREFUSED` | `API_INTERNAL_URL` wrong at runtime, or the API is down. |
| Browser `/api/*` requests get Next's 404 page | nginx has no `location /api/` block, so `/api` falls through to Next (built with `API_PROXY=off`, it doesn't proxy). |
| Everyone hits sign-in rate limits together | `TRUSTED_PROXY` doesn't list the Next server (or nginx), so all requests look like one client. |
| Signed in, but the session is lost on the next page | `WEB_ORIGIN` is `https://` while the site is served over plain HTTP (cookie is `Secure`). |
| Image upload fails with 413 | `client_max_body_size` missing or below 5m. |
