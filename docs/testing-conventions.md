# Testing conventions

Vitest for unit and integration tests, Playwright for end-to-end.

```bash
docker compose up -d       # Postgres must be running for API tests
pnpm test                  # unit + integration, all packages
pnpm test:e2e              # Playwright (boots web + api itself)
pnpm --filter api test:watch
```

## What to test, and where

Bias towards **integration tests over unit tests**. Every bug this codebase has
actually shipped lived at a boundary — CORS method lists, a `Content-Type`
header on a bodyless request, an error handler turning a 400 into a 500. None
would have been caught by a unit test with a mocked Prisma.

| Layer                      | Test with                       | Why                                              |
| -------------------------- | ------------------------------- | ------------------------------------------------ |
| API routes                 | Vitest + `app.inject()`         | Exercises the real plugin/validation lifecycle    |
| Pure client logic          | Vitest, mocked `fetch`          | Fast, no DOM needed                               |
| Full user flow             | Playwright                      | Catches anything only a browser sees              |
| Thin service/repository    | usually nothing                 | Mock-heavy tests that assert mocks were called    |

Add a service-level unit test once the logic is worth isolating — branching,
calculation, non-trivial invariants. A passthrough plus a not-found throw isn't.

## API integration tests

`apps/api/src/**/*.test.ts`, run against the real `eventapp_test` database.

- Use `buildApp()` + `app.inject()` — no port binding, but the full request
  lifecycle including the error handler.
- `vitest.setup.ts` truncates tables before each test; `fileParallelism` is off
  because tests share one database.
- `DATABASE_URL` is set in `vitest.config.ts` (not a setup file) because
  `@repo/db` builds its connection pool at import time.
- `pnpm test` runs `test:db:migrate` (`prisma migrate deploy`) first, so the
  test database is always at the latest migration.
- Signed-in requests: `signUp(app)` from `src/test/auth.ts` registers a fresh
  user through the real endpoint and returns `{ user, cookie, email, password }`;
  send `headers: { cookie }`. `makeAdmin(user.id)` promotes one;
  `sessionCookieFrom(response)` extracts the cookie; `TEST_PASSWORD` is the
  default password.
- Build the app with `buildApp({ rateLimits: false })` — every suite signs up
  more often than the limits allow. Only `app.security.test.ts` keeps them on.
- Email flows: `buildApp({ mailer: new MemoryMailer() })`, then
  `mailer.tokenFor(email)` returns the token from the latest link. Some mail is
  sent asynchronously (forgot-password is fire-and-forget), so wait for it
  first (`mailArrived(n)` in `auth.email.test.ts`, a `vi.waitFor` on
  `mailer.messages`) instead of asserting right after the response.
- `vitest.setup.ts` also truncates `AuthToken`, `Session` and `User`.

The API logger is silenced when `NODE_ENV === "test"`.

## Regression tests

When you fix a bug, write the test that fails without the fix, and say so in a
comment:

```ts
// Regression: @fastify/cors defaults to GET,HEAD,POST, which silently blocked
// every edit and delete from the browser.
```

Then verify it has teeth — revert the fix, watch it fail, restore. A regression
test that passes against the broken code is worse than none.

## Server Actions and server rendering

Server Actions (`apps/web/app/actions/*`) are unit-tested next to the action
with `vi.mock("@/lib/api.server")` (so no API is needed) and a mock of
`next/navigation` (`redirect` throws, as in Next) and `next/headers` where
cookies are set. Assert the returned `FormState` and the calls made to the API.

## E2E

`apps/e2e` is its own workspace package because the suite spans both apps. The
Playwright config boots the API and web dev servers, reusing anything already
running locally.

- Select by role and accessible name (`getByRole("button", { name: "Save" })`),
  never by StyleX class — those hashes change every build.
- Server-rendered HTML can be asserted without a browser:
  `await (await request.get(`${baseURL}/…`)).text()` carries the signed-in
  user's cookie from the storage state (use `playwright.request.newContext()`
  for a signed-out request). See `ssr.spec.ts`.
- Name fixtures uniquely per run and clean up afterwards; specs run against the
  development database, not a dedicated one. Deleting an event through the
  API also deletes its venue, so deleting the events a test created is enough.
  The events spec runs a `beforeAll` sweep for anything a previous,
  interrupted run left behind — before any test in the file, so a run that
  fails early still leaves the database clean for the next one.
- Keep it to a handful of high-value flows. E2E is the slowest, flakiest layer;
  push detail down into integration tests.

First run needs browsers: `pnpm --filter e2e exec playwright install chromium`.

- Never let a test call a third-party service. The address-search specs stub
  `**/api/geocode**`; pointing them at Photon would make them fail on someone
  else's outage and spend someone else's quota.
