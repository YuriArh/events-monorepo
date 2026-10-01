# Server-rendered web with a hydrated query cache — design

**Date:** 2026-10-02
**Status:** Approved, not yet planned

## Goal

Every page in `apps/web` renders its HTML on the server, with the data already
in it. Events and the current user are fetched on the server, rendered, and
handed to the browser's TanStack Query cache, so client components keep a live
cache (invalidation, refetch, optimistic updates) without a second request.
This is the default for all event and user data.

## Decisions

| Question | Decision |
| --- | --- |
| How the server knows the user | Next **proxies** `/api/*` and `/uploads/*` to Fastify. The browser only talks to the web origin, so the `sid` cookie belongs to it; the server reads it with `cookies()` and forwards it to the API. |
| Reading events and the user | **Server prefetch into TanStack Query + `HydrationBoundary`** — the default. Client components read with `useQuery` and the same query options. |
| Simple forms (sign-in, register, forgot/reset password, verify email, account, sign-out) | **Server Actions** with `useActionState`; work without JavaScript. |
| Complex interactive forms (create/edit event, and future ones like it) | **TanStack Form + TanStack Query mutations** against `/api` through the proxy, then `invalidateQueries`. |
| Deleting an event | TanStack Query mutation (same style as the other event writes). |
| Validation | One Zod contract from `@repo/contracts`, run in the Server Action / by the API (authoritative); fast hints in the browser (HTML attributes for simple forms, TanStack Form for complex ones). |
| CORS | Removed from the API — the browser no longer calls it cross-origin. |

## Why a proxy

The session cookie is set by the API. Today the browser calls the API on its
own origin, so the cookie belongs to the API's host; in production
(`app.example.com` + `api.example.com`) the Next server never sees it and
can't render anything user-specific. Proxying makes the API same-origin for the
browser: the cookie belongs to the web host, `credentials`/CORS disappear, and
Server Components and Server Actions can read it. Works with any deployment.

## Architecture

```
browser ──/api/*, /uploads/*──▶ Next rewrites ──▶ Fastify      (client queries, mutations, uploads)
browser ──page request───────▶ Next server ──apiFetch + cookie──▶ Fastify   (prefetch, Server Actions)
                                      └── dehydrate ──▶ HydrationBoundary ──▶ client QueryClient
```

### Proxy — `apps/web/next.config.mjs`

`rewrites()` maps `/api/:path*` and `/uploads/:path*` to
`${API_INTERNAL_URL}/...` (`API_INTERNAL_URL` defaults to
`http://localhost:4000`). `NEXT_PUBLIC_API_URL` is removed.

### HTTP clients — one core, two contexts

- `lib/api.ts` (isomorphic): `apiFetch(path, init)` builds the URL —
  relative (`""`, i.e. through the proxy) in the browser, `API_INTERNAL_URL`
  on the server — and sets JSON `Content-Type` only for string bodies.
  `request<T>()` = `apiFetch` + the existing `ApiError` handling.
  `credentials: "include"` goes away (same origin).
- `lib/api.server.ts` (server only): `serverRequest<T>()` / `serverFetch()`
  wrap the same core and add the incoming `sid` cookie (`cookies()`) and the
  client's `X-Forwarded-For` (`headers()`); `applySessionCookie(response)`
  copies the API's `Set-Cookie` for `sid` onto the outgoing response with
  `cookies().set` / `.delete` — used by sign-in, register, sign-out and
  account deletion.

### Query layer — `lib/queries.ts` (isomorphic)

One place for keys and query options, used identically on both sides:

```ts
export const eventKeys = { all: ["events"] as const, detail: (id: string) => ["events", id] as const };
export const meKey = ["me"] as const;

export const eventQueries = {
    list: (fetcher: Fetcher = request) =>
        queryOptions({ queryKey: eventKeys.all, queryFn: () => fetcher<EventRecord[]>("/api/events") }),
    detail: (id: string, fetcher: Fetcher = request) =>
        queryOptions({ queryKey: eventKeys.detail(id), queryFn: () => fetchEvent(id, fetcher) }), // null on 404 and for "."/".."
};
export const meQuery = (fetcher: Fetcher = request) =>
    queryOptions({ queryKey: meKey, queryFn: () => fetchMe(fetcher) }); // null when signed out
```

The server passes `serverRequest` as the fetcher; the browser uses the default.

### Query client — `lib/query-client.ts`

`getQueryClient()` per TanStack's SSR guide: on the server a new client per
request (memoised with React `cache`, so the layout and the page share one);
in the browser a singleton. Default `staleTime: 60_000` so hydrated data isn't
refetched immediately. `Providers` uses it and keeps today's behaviour: a 401
anywhere sets `me` to `null`; 401s aren't retried.

### Rendering pattern (the default)

```tsx
// a server page
const queryClient = getQueryClient();
await queryClient.prefetchQuery(eventQueries.list(serverRequest));
return (
    <HydrationBoundary state={dehydrate(queryClient)}>
        <EventList /> {/* "use client"; useQuery(eventQueries.list()) */}
    </HydrationBoundary>
);
```

- The **root layout** prefetches `meQuery` for every page; the header and all
  ownership checks read `me` from the cache.
- `getMe()` (server) = `getQueryClient().fetchQuery(meQuery(serverRequest))` —
  deduplicated with the layout's prefetch. Used by guards.
- After a Server Action redirects or revalidates, Next re-renders the layout;
  its newer `me` hydrates over the client cache, so sign-in/out and profile
  changes show up without manual cache edits.

## Pages

| Route | Server | Client component (SSR-rendered, cache-backed) |
| --- | --- | --- |
| layout | prefetch `me`, `metadataBase` from `SITE_URL` | `SiteHeader` (`useQuery(meQuery())`); Sign out = `<form action={logout}>` |
| `/` | prefetch list | `EventList` — table, owner Edit/Delete via `canModifyEvent(me)`, `DeleteEventDialog` |
| `/events/[id]` | `fetchQuery(detail)`; `null` → `notFound()` (real 404); `generateMetadata` from the same cached query | `EventDetail` — today's markup, `LocalDateTime`, owner actions |
| `/events/new` | guard (`getMe()` → `redirect("/login?next=/events/new")`) | `NewEventForm` — TanStack Form + `useMutation` (upload via `/api/events/upload`, create via `/api/events`), invalidate `eventKeys.all`, `router.push` |
| `/events/[id]/edit` | guard; prefetch detail; `notFound()`; not the organizer/admin → "Only the organizer…" rendered on the server | `EditEventForm` — `useQuery(detail)` + `useMutation` |
| `/login`, `/register` | page; `next` read from `searchParams` and passed down (no `useSearchParams`/Suspense) | form with `useActionState(login \| register)` |
| `/forgot-password`, `/reset-password` | page; token from `searchParams` | form with `useActionState` |
| `/verify-email?token=` | page; token from `searchParams` | **"Confirm email" button** form with `useActionState(verifyEmail)` (also works without JS) |
| `/account` | guard | sections as forms with Server Actions; data from `useQuery(meQuery())` |

`/verify-email` uses a button rather than verifying during render: tokens are
single-use, and rendering can repeat (refresh, prefetch, mail-client link
scanners) — the second render would show "invalid link" for a verified user.

## Server Actions — `app/actions/auth.ts`, `app/actions/account.ts`

Shared shape (`lib/form-state.ts`):

```ts
export type FormState = {
    fieldErrors?: Record<string, string>;
    formError?: string;
    message?: string; // success text for forms that stay on the page
    values?: Record<string, string>; // echoed back (never passwords): React 19 resets the form after an action
};
```

Each action: `contract.safeParse(Object.fromEntries(formData))` → on failure
`{ fieldErrors: issuesByField(issues), values }` → `serverFetch` to the API →
map 400 issues with `issuesByField`, 401/409/429 to `formError` → on success
`applySessionCookie` where relevant, then `redirect(...)` or
`revalidatePath("/", "layout")` + `{ message }`.

- `login(next)` → `redirect(safeNext(next))`; `register` → `redirect("/")`
- `logout` → `redirect("/")`; `logoutAll` → `redirect("/login")`
- `forgotPassword` → `{ message }` (same text whether or not the account exists)
- `resetPassword(token)` → `{ message }` with a sign-in link
- `verifyEmail(token)` → `{ message }` / `{ formError }`
- `resendVerification`, `changePassword`, `updateProfile` → `{ message }` + revalidate
- `deleteAccount` → clear cookie, `redirect("/")`

Next's built-in Server Action CSRF protection (Origin vs Host) applies; the
API's own Origin check still guards `/api` writes through the proxy.

## API changes

- Remove `@fastify/cors` registration (and its tests); keep the Origin check.
- `trustProxy` for loopback only (`["127.0.0.1", "::1"]`), so the client IP the
  proxy/`serverFetch` forwards in `X-Forwarded-For` is what rate limits key on.
  Without it every request would come from the Next server's IP and per-IP
  limits would become global.

## What is removed

- `lib/auth.ts` (`authApi`, `useMe`, `useRequireUser`). `Me`, `safeNext`,
  `canModifyEvent` move to `lib/session.ts` (server-safe).
- `lib/events.server.ts` (replaced by `eventQueries.detail` + `serverRequest`).
- `EventOwnerActions`' own `useMe`; the full-page-reload sign-out.
- `"use client"` on every page file.

## Known limitations

- **Session renewal** happens on browser `/api` calls (the proxy relays the
  API's `Set-Cookie`), not during server rendering — Next can't set cookies
  while rendering. The `me` query refetches in the browser after `staleTime`,
  which keeps an active session renewed.
- Two mutation styles exist by design (Server Actions for simple forms,
  TanStack mutations for complex ones); the rule above decides which.

## Testing

- **Unit (web):** `applySessionCookie` (parses `Set-Cookie`, sets/deletes
  `sid`), `apiFetch` base URL per context, `fetchEvent`/`fetchMe` null cases,
  each Server Action's validation path (contract failure → `fieldErrors`,
  password never echoed).
- **API:** CORS tests removed; a test that a request from loopback with
  `X-Forwarded-For` is rate-limited by the forwarded IP.
- **E2E:** all existing specs pass with the same selectors, plus:
  - sign-in with JavaScript disabled (`javaScriptEnabled: false`) reaches `/`
    and the header shows the user;
  - a guarded page without a session answers with a redirect to
    `/login?next=…` in the HTTP response itself;
  - the server HTML of `/` already contains the signed-in user's name and an
    event's name.

## Out of scope

- Next `proxy` (formerly middleware) for session renewal.
- Optimistic updates (the cache makes them possible later).
- Mobile/other clients.
