---
name: verify
description: Run the eventapp web + API locally and drive the web app in a real browser to verify a change.
---

# Verify the web app

Postgres must be up (`docker compose up -d` from the repo root; if the API's
tests pass, it is). Check ports 3000/4000 are free first
(`lsof -nP -iTCP:3000 -iTCP:4000 -sTCP:LISTEN`) — otherwise you'd be driving
someone else's checkout.

```bash
pnpm --filter api dev   # background → :4000, GET /health = 200
pnpm --filter web dev   # background → :3000
```

Wait with `curl --retry 60 --retry-delay 1 --retry-all-errors http://localhost:3000/`.

## Driving

Playwright lives in `apps/e2e`; a throwaway script outside the repo can load it
with `createRequire("<repo>/apps/e2e/package.json")("@playwright/test").chromium`.

Flows that touch every module:

- guest `/events/new` → redirected to `/login?next=%2Fevents%2Fnew`
- `/register` (Email, Password, "Create account") → header nav "Account" shows the email, `sid` cookie set
- `/events/new`: Name, Description, Venue (`placeholder="Search for an address"`, pick `role=option`), "Create" → back on `/`, row is a `cell`
- event link → `/events/<id>`: Edit/Delete visible for the owner; the name is in the server HTML (`curl`)
- `/events/<id>/edit` → prefilled, "Save" → `/`
- `/account`: Name + first "Save" → "Saved", header shows the new name
- Delete → `alertdialog` → back on `/`; the deleted id → HTTP 404
- `/login?next=//evil.example` → hidden `next` is `/`

SSR check without a browser: `curl -s localhost:3000/` contains event names and
`"queryKey":["events"]` / `["me"]` in the dehydrated state.

## Gotchas

- `pnpm test:e2e` writes the tracked `apps/e2e/test-results/.last-run.json`; `git restore` it.
- On `/register` there are two "Sign in" links (header + "Already have an account?"); scope locators to `getByRole("navigation", { name: "Account" })`.
- The venue map is an OSM iframe; it often stays blank headless.
- Form error banners are plain `<p>`, not `role="alert"` — locate them by text.
- Sign out flips the header in `onSubmit`, before the Server Action clears `sid`: wait for `networkidle` before checking cookies.
- A fresh worktree can't `pnpm install --frozen-lockfile` with pnpm 10.15.1 (`ERR_PNPM_BROKEN_LOCKFILE`, two YAML documents). Locally: strip the first lockfile document and `devEngines` from `package.json`, `pnpm install --frozen-lockfile --ignore-scripts`, `git restore` both, `pnpm rebuild`, `pnpm --filter ./packages/db run postinstall`. Copy `apps/api/.env`, `apps/web/.env.local`, `packages/db/.env` from another checkout.
