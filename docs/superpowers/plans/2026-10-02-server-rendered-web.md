# Server-rendered web with a hydrated query cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page in `apps/web` is a Server Component whose HTML contains its data; events and the current user are prefetched on the server into the TanStack Query cache and read on the client with `useQuery`; simple forms use Server Actions, the event form keeps TanStack Form + mutations through an `/api` proxy.

**Architecture:** The API is same-origin for the browser (`/api/*`, `/uploads/*`), so the `sid` cookie belongs to the web origin. In development Next `rewrites` provide that (switchable with `API_PROXY=off`); in production nginx does, routing API traffic straight to Fastify — the web code doesn't depend on which. An isomorphic `apiFetch`/`request` core is used by the browser (relative URLs) and by `serverFetch`/`serverRequest` on the server (absolute URL + forwarded cookie and IP). Shared query options in `lib/queries.ts` drive both server prefetch (`HydrationBoundary`) and client `useQuery`. Server Actions relay the API's `Set-Cookie` with `cookies().set/delete`.

**Tech Stack:** Next.js 16 App Router, React 19 (`useActionState`), TanStack Query 5.103 (`HydrationBoundary`, `isServer`, `queryOptions`), TanStack Form, Fastify 5, Zod 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-server-rendered-web-design.md`

## Global Constraints

- `AGENTS.md` principles: KISS, DRY, server rendering first — every page is a Server Component; events and the current user are always fetched on the server **into the TanStack Query cache** and read with `useQuery` via `lib/queries.ts`; `"use client"` only on the smallest component that needs the browser. Simple forms → Server Actions; complex interactive forms → TanStack Form + TanStack Query mutations through `/api`.
- Next.js here differs from older versions: before writing Next code read the relevant pages in `apps/web/node_modules/next/dist/docs/01-app/` (cookies, headers, redirect, rewrites, Server Functions / `07-mutating-data.md`, `not-found`, `generate-metadata`). Cookies can only be set in Server Functions / Route Handlers, never while rendering.
- TanStack SSR: follow the "Advanced Server Rendering" pattern — per-request server `QueryClient` (React `cache`), browser singleton, `staleTime > 0`, `dehydrate` + `HydrationBoundary`.
- Files importing `next/headers` (`*.server.ts`) must never be imported by a `"use client"` module.
- Never commit `AGENTS.md` changes made by tools (turbo appends a block), `apps/web/AGENTS.md`, `apps/web/next-env.d.ts`, `pnpm-lock.yaml`, `apps/e2e/test-results/`, `.superpowers/`. Restore them with `git checkout -- <file>`.
- Never hand-edit `apps/web/app/components/ui/**`. StyleX only. Web files: 4-space indentation; API source 2-space, tests 4-space; `.js` relative imports in API/e2e.
- Keep the e2e selectors working: header `navigation "Account"`, links "Sign in"/"Register"/"Account", button "Sign out", list `Edit <name>` / `Delete <name>`, name links, form labels and buttons ("Sign in", "Create account", "Create", "Save").
- Each task ends with `pnpm check-types && pnpm lint && pnpm test` green (zero lint warnings) and `pnpm --filter web build` passing. Tasks that touch routes also run `pnpm test:e2e` — ports 3000/4000 must be free before; if anything listens there, STOP and report; after the run, verify nothing is left listening (Playwright has orphaned `pnpm dev` children before — kill only processes whose cwd is this worktree).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

| File | Change |
| --- | --- |
| `apps/api/src/app.ts` (+ tests) | drop CORS registration; `trustProxy` loopback |
| `apps/web/next.config.mjs` | `rewrites` for `/api` and `/uploads` |
| `apps/web/app/lib/api.ts` | `apiBaseUrl`, `apiFetch`, `readResponse`, `request`, `Fetcher` |
| `apps/web/app/lib/set-cookie.ts` (+test) | pure `parseSessionSetCookie` |
| `apps/web/app/lib/api.server.ts` | `serverFetch`, `serverRequest`, `applySessionCookie` |
| `apps/web/app/lib/session.ts` | `Me`, `SESSION_COOKIE`, `safeNext`, `canModifyEvent` (moved from `lib/auth.ts`) |
| `apps/web/app/lib/queries.ts` (+test) | keys, `eventQueries`, `meQuery`, `fetchMe`, `fetchEvent` |
| `apps/web/app/lib/query-client.ts` / `query-client.server.ts` | browser/SSR clients; per-request server client |
| `apps/web/app/lib/session.server.ts` | `getMe()` |
| `apps/web/app/lib/form-state.ts` | `FormState` |
| `apps/web/app/lib/form-errors.ts` | gains `issuesByField` (moved from `lib/event-form.ts`) |
| `apps/web/app/actions/auth.ts`, `actions/account.ts` | Server Actions |
| `apps/web/app/providers.tsx`, `layout.tsx` | `getQueryClient`; prefetch `me` + `HydrationBoundary` |
| `apps/web/app/components/site-header.tsx` | `useQuery(meQuery())`; Sign out = form action |
| `apps/web/app/components/text-field.tsx` | uncontrolled mode (`name`, `defaultValue`, `required`, …) |
| `apps/web/app/components/event-list.tsx` | the list UI moved out of `app/page.tsx` |
| `apps/web/app/components/event-detail.tsx` | the detail UI moved out of `app/events/[id]/page.tsx` |
| `apps/web/app/components/new-event-form.tsx`, `edit-event-form.tsx` | client parts of the event pages |
| `apps/web/app/components/auth-forms.tsx` | `LoginForm`, `RegisterForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `VerifyEmailForm` |
| `apps/web/app/components/account-sections.tsx` | account forms |
| all `apps/web/app/**/page.tsx` | Server Components |
| `apps/web/app/lib/auth.ts`, `lib/events.server.ts` | deleted |
| `apps/e2e/tests/event-detail.spec.ts`, new `apps/e2e/tests/ssr.spec.ts` | e2e |
| `docs/architecture.md`, `docs/testing-conventions.md` | docs |

---

### Task 1: API — no CORS, trust the local proxy

**Files:** Modify `apps/api/src/app.ts`, `apps/api/src/lib/config.ts`; tests in `apps/api/src/modules/events/event.routes.test.ts` (CORS block) and `apps/api/src/app.security.test.ts`.

- [ ] **Step 1: Failing test** — append to `app.security.test.ts` (suite already builds with `rateLimits: true`):

```ts
describe("behind the web proxy", () => {
    // The web app proxies browser calls and forwards the client's IP; without
    // trusting it, every visitor would share the proxy's rate-limit bucket.
    it("rate-limits by the forwarded client IP, not the proxy's", async () => {
        const attempt = (clientIp: string) =>
            app.inject({
                method: "POST",
                url: "/api/auth/login",
                remoteAddress: "127.0.0.1",
                headers: { "x-forwarded-for": clientIp },
                payload: { email: "proxied@example.test", password: "guess" },
            });

        for (let i = 0; i < 5; i += 1) {
            expect((await attempt("203.0.113.7")).statusCode).toBe(401);
        }

        expect((await attempt("203.0.113.7")).statusCode).toBe(429);
        expect((await attempt("198.51.100.9")).statusCode).toBe(401);
    });
});
```

Run `pnpm --filter api exec vitest run src/app.security.test.ts` → FAIL (both IPs share 127.0.0.1's bucket: the last call is 429).

- [ ] **Step 2: Implement** — in `apps/api/src/lib/config.ts` add:

```ts
/**
 * Proxies whose X-Forwarded-For we believe (comma-separated addresses/CIDRs):
 * the dev Next proxy on loopback by default; nginx's address in production.
 * Trusting nobody makes every visitor share the proxy's IP; trusting everybody
 * lets anyone spoof the header and dodge rate limits.
 */
export const TRUSTED_PROXY = (process.env.TRUSTED_PROXY ?? "127.0.0.1,::1")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
```

and in `buildApp`: `Fastify({ logger: …, trustProxy: TRUSTED_PROXY })`. Add a second test case: with `TRUSTED_PROXY` unchanged, a request whose `remoteAddress` is NOT loopback (e.g. `"203.0.113.50"`) and a spoofed `x-forwarded-for` is keyed by its real address (5 attempts with varying spoofed headers → the 6th is 429). Remove the `@fastify/cors` import and `app.register(cors, …)`. Delete the `describe("CORS", …)` block in `event.routes.test.ts`. Leave the `@fastify/cors` dependency in `package.json` (removing it would rewrite the lockfile, which this environment's pnpm can't read cleanly) — note it in the commit message as a follow-up.

- [ ] **Step 3: Verify** `pnpm --filter api check-types && pnpm --filter api lint && pnpm --filter api test` → PASS.

- [ ] **Step 4: Commit** `git add apps/api && git commit -m "Trust the local web proxy for client IPs; drop CORS (browser is same-origin now)"` + trailer. (Mention: `@fastify/cors` dependency left for a lockfile-safe follow-up.)

---

### Task 2: Web — proxy, HTTP clients, query layer, hydrated header

**Files:** `next.config.mjs`; `lib/api.ts`, `lib/set-cookie.ts` (+test), `lib/api.server.ts`, `lib/session.ts`, `lib/session.server.ts`, `lib/queries.ts` (+test), `lib/query-client.ts`, `lib/query-client.server.ts`, `lib/form-state.ts`, `lib/form-errors.ts`; `actions/auth.ts` (only `logout` in this task); `providers.tsx`, `layout.tsx`, `components/site-header.tsx`; `lib/auth.ts` becomes a thin compatibility layer until Task 5; `lib/events.ts`.

**Interfaces produced:**
- `apiBaseUrl(): string`, `apiFetch(path, init?): Promise<Response>`, `readResponse<T>(response): Promise<T>`, `request<T>(path, init?)`, `type Fetcher = <T>(path: string, init?: RequestInit) => Promise<T>`
- `serverFetch(path, init?)`, `serverRequest: Fetcher`, `applySessionCookie(response): Promise<void>`
- `eventKeys`, `meKey`, `eventQueries.list(fetcher?)`, `eventQueries.detail(id, fetcher?)`, `meQuery(fetcher?)`, `fetchMe(fetcher)`, `fetchEvent(id, fetcher)`
- `getQueryClient()` (client-safe), `getServerQueryClient()` (server), `getMe()` (server)
- `Me`, `SESSION_COOKIE`, `safeNext`, `canModifyEvent` from `lib/session.ts`
- `FormState`; `issuesByField`, `uncoveredMessage` from `lib/form-errors.ts`

- [ ] **Step 1: Failing unit tests**

`apps/web/app/lib/set-cookie.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseSessionSetCookie } from "./set-cookie";

describe("parseSessionSetCookie", () => {
    it("reads the value and expiry of the session cookie", () => {
        expect(
            parseSessionSetCookie([
                "other=1; Path=/",
                "sid=abc123; Path=/; Expires=Fri, 01 Nov 2030 10:00:00 GMT; HttpOnly; SameSite=Lax",
            ]),
        ).toEqual({ value: "abc123", expires: new Date("2030-11-01T10:00:00.000Z"), secure: false });
    });

    it("notices Secure", () => {
        expect(parseSessionSetCookie(["sid=x; Path=/; HttpOnly; Secure"])?.secure).toBe(true);
    });

    it("treats an emptied cookie as a deletion", () => {
        expect(parseSessionSetCookie(["sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"])).toEqual({
            value: "",
            expires: new Date(0),
            secure: false,
        });
    });

    it("is null when the response sets no session cookie", () => {
        expect(parseSessionSetCookie(["other=1"])).toBeNull();
    });
});
```

`apps/web/app/lib/queries.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import { fetchEvent, fetchMe } from "./queries";

describe("fetchMe", () => {
    it("returns the user", async () => {
        const fetcher = vi.fn().mockResolvedValue({ user: { id: "u1" } });
        await expect(fetchMe(fetcher)).resolves.toEqual({ id: "u1" });
        expect(fetcher).toHaveBeenCalledWith("/api/auth/me");
    });

    it("is null when signed out", async () => {
        const fetcher = vi.fn().mockRejectedValue(new ApiError("Authentication required", 401));
        await expect(fetchMe(fetcher)).resolves.toBeNull();
    });

    it("rethrows other failures", async () => {
        const fetcher = vi.fn().mockRejectedValue(new ApiError("boom", 500));
        await expect(fetchMe(fetcher)).rejects.toThrow("boom");
    });
});

describe("fetchEvent", () => {
    it("is null for an unknown event", async () => {
        const fetcher = vi.fn().mockRejectedValue(new ApiError("not found", 404));
        await expect(fetchEvent("missing", fetcher)).resolves.toBeNull();
    });

    // URL normalisation would turn these into the list / root endpoints.
    it.each([".", ".."])("is null for %s without calling the API", async (id) => {
        const fetcher = vi.fn();
        await expect(fetchEvent(id, fetcher)).resolves.toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("encodes the id", async () => {
        const fetcher = vi.fn().mockResolvedValue({ id: "a b" });
        await fetchEvent("a b", fetcher);
        expect(fetcher).toHaveBeenCalledWith("/api/events/a%20b");
    });
});
```

Run `pnpm --filter web test` → FAIL (modules missing).

- [ ] **Step 2: Proxy** — `apps/web/next.config.mjs`:

```js
/** Where the Next server reaches Fastify. The browser never does — it goes through the rewrites below. */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Development proxy. In production nginx routes /api and /uploads straight to
 * Fastify (docs/architecture.md → Deploying) and Next runs with API_PROXY=off.
 */
const proxyEnabled = process.env.API_PROXY !== "off";

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Same-origin API for the browser: the session cookie belongs to the web
    // host, so Server Components and Server Actions can read it.
    async rewrites() {
        return proxyEnabled
            ? [
                  { source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` },
                  { source: "/uploads/:path*", destination: `${API_INTERNAL_URL}/uploads/:path*` },
              ]
            : [];
    },
};

export default nextConfig;
```

(Read `rewrites.md` in the Next docs first; keep the existing file's module format.)

- [ ] **Step 3: HTTP core** — replace `apps/web/app/lib/api.ts`:

```ts
/** Matches the shape `issuesByField` (in lib/form-errors.ts) expects. */
export type ApiIssue = { path: PropertyKey[]; message: string };

export class ApiError extends Error {
    status: number;
    issues?: ApiIssue[];

    constructor(message: string, status: number, issues?: ApiIssue[]) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.issues = issues;
    }
}

export type Fetcher = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Browser: same origin, through the Next proxy (next.config rewrites), so the
 * session cookie rides along by itself. Server: straight to the API.
 */
export const apiBaseUrl = () =>
    typeof window === "undefined" ? (process.env.API_INTERNAL_URL ?? "http://localhost:4000") : "";

export const apiFetch = (path: string, init?: RequestInit) =>
    fetch(`${apiBaseUrl()}${path}`, {
        cache: "no-store",
        ...init,
        headers: {
            // Only on requests that actually carry a JSON body: an empty body makes
            // Fastify reject the request, and FormData needs its own boundary.
            ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
        },
    });

export async function readResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
            body?.message ?? `Request failed with status ${response.status}`,
            response.status,
            Array.isArray(body?.issues) ? body.issues : undefined,
        );
    }

    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
}

export const request: Fetcher = async (path, init) => readResponse(await apiFetch(path, init));
```

Update `lib/api.test.ts`: the credentials test becomes "calls a relative /api URL in the browser" (`fetchMock.mock.calls[0][0]` equals `"/api/anything"`; vitest's jsdom/happy-dom defines `window` — check `apps/web/vitest.config.*` environment; if it is `node`, stub `globalThis.window` for that test and restore it).

In `lib/events.ts`: `imageUrl = (key) => \`/uploads/${key}\``; remove the `API_URL` import; move `eventKeys` to `lib/queries.ts` and re-export it from `lib/events.ts` only if something still imports it from there (prefer updating imports).

- [ ] **Step 4: Session helpers**

`apps/web/app/lib/session.ts` — move `Me` (`= UserPublic`), `safeNext`, `canModifyEvent` here verbatim from `lib/auth.ts`, plus `export const SESSION_COOKIE = "sid";`. Move their tests (`lib/auth.test.ts` safeNext/canModifyEvent blocks) to `lib/session.test.ts`.

`apps/web/app/lib/set-cookie.ts`:

```ts
import { SESSION_COOKIE } from "./session";

/** The API's Set-Cookie for the session, reduced to what we re-issue on the web origin. Null if absent. */
export const parseSessionSetCookie = (setCookies: string[]) => {
    const raw = setCookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
    if (!raw) return null;

    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const value = (pair ?? "").slice(SESSION_COOKIE.length + 1);
    const expiresAttr = attributes.find((attr) => attr.toLowerCase().startsWith("expires="));

    return {
        value,
        expires: expiresAttr ? new Date(expiresAttr.slice("expires=".length)) : undefined,
        secure: attributes.some((attr) => attr.toLowerCase() === "secure"),
    };
};
```

(Adjust so the test's `toEqual` objects match exactly — e.g. omit `expires` when absent if that's cleaner, and update the "notices Secure" test accordingly.)

`apps/web/app/lib/api.server.ts`:

```ts
import { cookies, headers } from "next/headers";

import { type Fetcher, apiFetch, readResponse } from "./api";
import { SESSION_COOKIE } from "./session";
import { parseSessionSetCookie } from "./set-cookie";

/**
 * Server Components and Server Actions only (imports next/headers): an API call
 * carrying the visitor's session cookie and IP, like the proxy does for the browser.
 */
export async function serverFetch(path: string, init?: RequestInit) {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    const sid = cookieStore.get(SESSION_COOKIE)?.value;
    const forwardedFor = headerStore.get("x-forwarded-for");

    return apiFetch(path, {
        ...init,
        headers: {
            ...(sid ? { cookie: `${SESSION_COOKIE}=${sid}` } : {}),
            ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
            ...init?.headers,
        },
    });
}

export const serverRequest: Fetcher = async (path, init) => readResponse(await serverFetch(path, init));

/**
 * Re-issues the API's session cookie on the web origin (sign-in, register) or
 * clears it (sign-out, account deletion). Server Actions only — Next can't set
 * cookies while rendering.
 */
export async function applySessionCookie(response: Response) {
    const session = parseSessionSetCookie(response.headers.getSetCookie());
    if (!session) return;

    const cookieStore = await cookies();
    if (!session.value) {
        cookieStore.delete(SESSION_COOKIE);
        return;
    }

    cookieStore.set(SESSION_COOKIE, session.value, {
        httpOnly: true,
        sameSite: "lax",
        secure: session.secure,
        path: "/",
        expires: session.expires,
    });
}
```

Check whether `x-forwarded-for` is present on incoming requests in `next dev`/`next start` (log it once in a Server Component during the smoke check, then remove the log). If Next doesn't set it, fall back to nothing and record in the report that per-IP limits then key on the Next server for Server Action traffic.

- [ ] **Step 5: Query layer**

`apps/web/app/lib/queries.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";

import { ApiError, type Fetcher, request } from "./api";
import type { EventRecord } from "./events";
import type { Me } from "./session";

/** The one definition of each cached resource — used by server prefetch and client useQuery alike. */
export const eventKeys = {
    all: ["events"] as const,
    detail: (id: string) => ["events", id] as const,
};

export const meKey = ["me"] as const;

const nullOn = async <T>(status: number, load: () => Promise<T>) => {
    try {
        return await load();
    } catch (error) {
        if (error instanceof ApiError && error.status === status) return null;
        throw error;
    }
};

/** Null when signed out — a normal state, not an error. */
export const fetchMe = (fetcher: Fetcher) =>
    nullOn(401, async () => (await fetcher<{ user: Me }>("/api/auth/me")).user);

/** Null for unknown ids; "." / ".." would normalise to other endpoints. */
export const fetchEvent = async (id: string, fetcher: Fetcher) => {
    if (id === "." || id === "..") return null;
    return nullOn(404, () => fetcher<EventRecord>(`/api/events/${encodeURIComponent(id)}`));
};

export const eventQueries = {
    list: (fetcher: Fetcher = request) =>
        queryOptions({ queryKey: eventKeys.all, queryFn: () => fetcher<EventRecord[]>("/api/events") }),
    detail: (id: string, fetcher: Fetcher = request) =>
        queryOptions({ queryKey: eventKeys.detail(id), queryFn: () => fetchEvent(id, fetcher) }),
};

export const meQuery = (fetcher: Fetcher = request) =>
    queryOptions({ queryKey: meKey, queryFn: () => fetchMe(fetcher) });
```

`apps/web/app/lib/query-client.ts` (client-safe):

```ts
import { MutationCache, QueryCache, QueryClient, isServer } from "@tanstack/react-query";

import { ApiError } from "./api";
import { meKey } from "./queries";

export const makeQueryClient = () => {
    /** Any 401 means the session is gone: reflect that everywhere. */
    const onError = (error: unknown) => {
        if (error instanceof ApiError && error.status === 401) client.setQueryData(meKey, null);
    };

    const client: QueryClient = new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
            queries: {
                // Above zero, so data hydrated from the server isn't refetched on mount.
                staleTime: 60_000,
                retry: (failureCount, error) => !(error instanceof ApiError && error.status === 401) && failureCount < 1,
            },
        },
    });

    return client;
};

let browserClient: QueryClient | undefined;

/** SSR of client components: a fresh client per render. Browser: one client for the session. */
export const getQueryClient = () => (isServer ? makeQueryClient() : (browserClient ??= makeQueryClient()));
```

`apps/web/app/lib/query-client.server.ts`:

```ts
import { cache } from "react";

import { makeQueryClient } from "./query-client";

/** One client per request, shared by the layout, the page and generateMetadata. */
export const getServerQueryClient = cache(makeQueryClient);
```

`apps/web/app/lib/session.server.ts`:

```ts
import { serverRequest } from "./api.server";
import { meQuery } from "./queries";
import { getServerQueryClient } from "./query-client.server";

/** The visitor, or null. Deduplicated with the layout's prefetch. */
export const getMe = () => getServerQueryClient().fetchQuery(meQuery(serverRequest));
```

- [ ] **Step 6: Forms shared types** — move `issuesByField` from `lib/event-form.ts` into `lib/form-errors.ts` (update every import, move its tests). `apps/web/app/lib/form-state.ts`:

```ts
/** What a Server Action hands back to its form (via useActionState). */
export type FormState = {
    fieldErrors?: Record<string, string>;
    formError?: string;
    /** Success text for forms that stay on the page. */
    message?: string;
    /** Echoed input (never passwords): React 19 resets the form after an action. */
    values?: Record<string, string>;
};
```

- [ ] **Step 7: Sign-out action, providers, layout, header**

`apps/web/app/actions/auth.ts` (this task: `logout` only; Task 4 adds the rest):

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { applySessionCookie, serverFetch } from "@/lib/api.server";
import { SESSION_COOKIE } from "@/lib/session";

export async function logout() {
    const response = await serverFetch("/api/auth/logout", { method: "POST" });
    await applySessionCookie(response);
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/");
}
```

`providers.tsx`: replace the `useState` client with `const queryClient = getQueryClient();` (from `@/lib/query-client`); keep `"use client"`.

`layout.tsx` (Server Component, `async`):

```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
// …existing imports
import { serverRequest } from "./lib/api.server";
import { meQuery } from "./lib/queries";
import { getServerQueryClient } from "./lib/query-client.server";

export const metadata: Metadata = {
    metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
    title: "Events",
    description: "Create and manage your events",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    // Every page needs `me` (header, ownership); fetch it once, here, into the cache.
    const queryClient = getServerQueryClient();
    await queryClient.prefetchQuery(meQuery(serverRequest));

    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <body>
                <Providers>
                    <HydrationBoundary state={dehydrate(queryClient)}>
                        <SiteHeader />
                        {children}
                    </HydrationBoundary>
                </Providers>
            </body>
        </html>
    );
}
```

(Keep the file's existing 2-space style.)

`components/site-header.tsx`: `const { data: me } = useQuery(meQuery());` (always hydrated, so drop the `isPending` gate); replace the Sign out `Button` + mutation with:

```tsx
<form action={logout}>
    <Button type="submit" variant="outline" size="sm">
        Sign out
    </Button>
</form>
```

`lib/auth.ts` (temporary, removed in Task 7): keep `authApi` for pages not yet migrated; replace `useMe` with `() => useQuery(meQuery())`; re-export `Me`, `safeNext`, `canModifyEvent`, `meKey` from their new homes so existing imports keep compiling. Delete `lib/events.server.ts` only in Task 3.

- [ ] **Step 8: Verify** unit tests pass; `pnpm check-types && pnpm lint && pnpm test`; `pnpm --filter web build`; `pnpm test:e2e` (all existing specs pass — browser calls now go through the proxy). Manual smoke (servers via e2e are enough): header HTML from `curl -s localhost:3000/` contains "Sign in".

- [ ] **Step 9: Commit** `git add apps/web && git commit -m "Proxy the API through Next and hydrate the current user from the server"` + trailer.

---

### Task 3: Event list and detail — server prefetch, cached client components

**Files:** `app/page.tsx` → Server Component + `components/event-list.tsx`; `app/events/[id]/page.tsx` + `components/event-detail.tsx`; `components/event-owner-actions.tsx`; delete `lib/events.server.ts`; `apps/e2e/tests/event-detail.spec.ts`.

- [ ] **Step 1: List** — move the whole current `app/page.tsx` component into `components/event-list.tsx` (`"use client"`, `export function EventList()`), changing only data access:

```tsx
const { data: me } = useQuery(meQuery());
const { data: events = [], isPending, error: listError } = useQuery(eventQueries.list());
```

`app/page.tsx` becomes:

```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { EventList } from "@/components/event-list";
import { serverRequest } from "@/lib/api.server";
import { eventQueries } from "@/lib/queries";
import { getServerQueryClient } from "@/lib/query-client.server";

export default async function HomePage() {
    const queryClient = getServerQueryClient();
    await queryClient.prefetchQuery(eventQueries.list(serverRequest));

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <EventList />
        </HydrationBoundary>
    );
}
```

- [ ] **Step 2: Detail** — move the JSX of `app/events/[id]/page.tsx` (from `<div {...stylex.props(styles.page)}>` down) and its `styles` into `components/event-detail.tsx` (`"use client"`, `export function EventDetail({ id }: { id: string })`), reading `const { data: event } = useQuery(eventQueries.detail(id));` and returning `null` when `!event` (deleted meanwhile). `EventOwnerActions` reads `me` with `useQuery(meQuery())`.

`app/events/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { EventDetail } from "@/components/event-detail";
import { serverRequest } from "@/lib/api.server";
import { imageUrl } from "@/lib/events";
import { eventQueries } from "@/lib/queries";
import { getServerQueryClient } from "@/lib/query-client.server";

type Props = { params: Promise<{ id: string }> };

const DESCRIPTION_LIMIT = 160;

const loadEvent = (id: string) => getServerQueryClient().fetchQuery(eventQueries.detail(id, serverRequest));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const event = await loadEvent((await params).id);
    if (!event) notFound();

    return {
        title: event.name,
        description: event.description?.slice(0, DESCRIPTION_LIMIT) || undefined,
        openGraph: event.imageKey ? { images: [imageUrl(event.imageKey)] } : undefined,
    };
}

export default async function EventPage({ params }: Props) {
    const { id } = await params;
    // Awaited before anything streams, so the status is a real 404.
    if (!(await loadEvent(id))) notFound();

    return (
        <HydrationBoundary state={dehydrate(getServerQueryClient())}>
            <EventDetail id={id} />
        </HydrationBoundary>
    );
}
```

Delete `lib/events.server.ts` (replaced by `eventQueries.detail` + `serverRequest`).

- [ ] **Step 3: e2e** — `event-detail.spec.ts` "hides owner actions from signed-out visitors": the server now renders the final state (`me` is hydrated as `null`), so there is no client `/api/auth/me` request to wait for. Remove the `waitForResponse` lines and keep the Edit/Delete `toBeHidden` assertions after the heading is visible; add a comment that the HTML is final because `me` is server-rendered. Also add, in the SSR test, that the raw HTML of the owner's page contains "Edit" for the signed-in e2e user (`request` carries the storage state).

- [ ] **Step 4: Verify** — checks, build (`/` and `/events/[id]` dynamic), `pnpm test:e2e`.

- [ ] **Step 5: Commit** `git add apps/web apps/e2e && git commit -m "Server-prefetch events into the query cache for the list and detail pages"` + trailer.

---

### Task 4: Auth pages — Server Actions

**Files:** `actions/auth.ts` (add actions), `components/text-field.tsx`, `components/auth-forms.tsx`; `app/login|register|forgot-password|reset-password|verify-email/page.tsx`.

- [ ] **Step 1: TextField uncontrolled mode** — make `value`/`onChange` optional; add `name?: string`, `defaultValue?: string`, `required?: boolean`, `minLength?: number`, `maxLength?: number` passed to `Input`. Keep `id` → `htmlFor`, error wiring unchanged.

- [ ] **Step 2: Actions** — add to `actions/auth.ts`:

```ts
import {
    forgotPasswordInput,
    loginInput,
    registerInput,
    resetPasswordInput,
    verifyEmailInput,
} from "@repo/contracts";

import { issuesByField } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";
import { safeNext } from "@/lib/session";

/** Text fields of a form submission. */
const textFields = (formData: FormData) =>
    Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>;

/** The API's error, mapped onto the form: 400 issues per field, anything else as the banner. */
const apiFailure = async (response: Response, values?: Record<string, string>): Promise<FormState> => {
    const body = await response.json().catch(() => null);
    return Array.isArray(body?.issues)
        ? { fieldErrors: issuesByField(body.issues), values }
        : { formError: body?.message ?? "Something went wrong", values };
};

const post = (path: string, body: unknown) => serverFetch(path, { method: "POST", body: JSON.stringify(body) });

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
    const data = textFields(formData);
    const values = { email: data.email ?? "" };
    const parsed = loginInput.safeParse(data);
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues), values };

    const response = await post("/api/auth/login", parsed.data);
    if (!response.ok) return apiFailure(response, values);

    await applySessionCookie(response);
    redirect(safeNext(data.next));
}

export async function register(_state: FormState, formData: FormData): Promise<FormState> {
    const data = textFields(formData);
    const values = { email: data.email ?? "", name: data.name ?? "" };
    const parsed = registerInput.safeParse({
        email: data.email,
        password: data.password,
        // An empty name means "no name", not an invalid one.
        name: data.name?.trim() ? data.name : undefined,
    });
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues), values };

    const response = await post("/api/auth/register", parsed.data);
    if (response.status === 409) return { fieldErrors: { email: "Email already registered" }, values };
    if (!response.ok) return apiFailure(response, values);

    await applySessionCookie(response);
    redirect("/");
}

export async function forgotPassword(_state: FormState, formData: FormData): Promise<FormState> {
    const parsed = forgotPasswordInput.safeParse(textFields(formData));
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues) };

    const response = await post("/api/auth/password/forgot", parsed.data);
    if (!response.ok) return apiFailure(response);

    // Same text whether or not the account exists — the API answers 204 either way.
    return { message: "If an account exists for that email, we've sent a link to reset the password." };
}

export async function resetPassword(_state: FormState, formData: FormData): Promise<FormState> {
    const parsed = resetPasswordInput.safeParse(textFields(formData));
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues) };

    const response = await post("/api/auth/password/reset", parsed.data);
    if (!response.ok) return apiFailure(response);

    return { message: "Your password has been changed and you've been signed out everywhere." };
}

export async function verifyEmail(_state: FormState, formData: FormData): Promise<FormState> {
    const parsed = verifyEmailInput.safeParse(textFields(formData));
    if (!parsed.success) return { formError: "This link is missing its token." };

    const response = await post("/api/auth/email/verify", parsed.data);
    if (!response.ok) return apiFailure(response);

    revalidatePath("/", "layout");
    return { message: "Your email is confirmed." };
}
```

(Add `revalidatePath` from `next/cache`. Note `redirect()` throws — keep it outside any try/catch.)

- [ ] **Step 3: Forms** — `components/auth-forms.tsx` (`"use client"`), one small component per form, all on this pattern:

```tsx
export function LoginForm({ next }: { next: string }) {
    const [state, formAction, pending] = useActionState(login, {});

    return (
        <form action={formAction} {...stylex.props(authStyles.form)}>
            <input type="hidden" name="next" value={next} />
            <FormBanner message={state.formError ?? null} />
            <TextField id="email" name="email" label="Email" type="email" autoComplete="email" required
                defaultValue={state.values?.email} error={state.fieldErrors?.email} />
            <TextField id="password" name="password" label="Password" type="password"
                autoComplete="current-password" required error={state.fieldErrors?.password} />
            <div {...stylex.props(authStyles.actions)}>
                <Button type="submit" disabled={pending}>Sign in</Button>
            </div>
        </form>
    );
}
```

- `RegisterForm`: fields `name` ("Name (optional)", `autoComplete="name"`), `email`, `password` (`minLength={8}`, `autoComplete="new-password"`); button "Create account"; non-field errors in the banner via `uncoveredMessage(state.fieldErrors ?? {}, new Set(["name", "email", "password"]))` together with `state.formError`.
- `ForgotPasswordForm`: on `state.message` render the status paragraph (`role="status"`, `authStyles.success`) instead of the form; button "Send link".
- `ResetPasswordForm({ token })`: hidden `token`; field `newPassword` "New password"; on success the message plus a `/login` link; no token → banner "This link is missing its token. Request a new one."
- `VerifyEmailForm({ token })`: hidden `token`; a "Confirm email" button; shows `state.message` / `state.formError`.

Drop `noValidate`: HTML validation is the fast, no-JS hint; the action re-validates with the contract.

- [ ] **Step 4: Pages** — each page is a Server Component; read `searchParams` (a Promise) on the server and pass values down — no `useSearchParams`, no Suspense:

```tsx
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    return (
        <AuthPage title="Sign in" footer={/* existing footer links */}>
            <LoginForm next={safeNext(next)} />
        </AuthPage>
    );
}
```

`/verify-email`: render `VerifyEmailForm` (explain in a comment why it's a button: tokens are single-use, rendering can repeat — refresh, prefetch, mail-client link scanners).

- [ ] **Step 5: Unit tests for actions' validation path** — in `apps/web/app/actions/auth.test.ts` mock `@/lib/api.server` (`vi.mock`) and `next/navigation`; assert: invalid email → `fieldErrors.email` and `values.email` echoed, `values` never contains `password`; register 409 → `fieldErrors.email = "Email already registered"`; login success calls `applySessionCookie` and `redirect` with `safeNext(next)`.

- [ ] **Step 6: Verify** — checks, build, `pnpm test:e2e` (auth.spec's register/sign-out/sign-in flow now goes through Server Actions).

- [ ] **Step 7: Commit** `git add apps/web && git commit -m "Move sign-in, registration and password pages to Server Actions"` + trailer.

---

### Task 5: Event create/edit — server guard, cached client forms

**Files:** `app/events/new/page.tsx`, `app/events/[id]/edit/page.tsx`, `components/new-event-form.tsx`, `components/edit-event-form.tsx`.

- [ ] **Step 1: New** — `components/new-event-form.tsx` (`"use client"`): today's `NewEventPage` body without `useRequireUser` (the server guards): `useMutation` → `resolveImageKey(values, uploadImage)` → `eventsApi.create(...)` → `invalidateQueries({ queryKey: eventKeys.all })` → `router.push("/")`; renders `<EventForm …/>`.

`app/events/new/page.tsx` (Server Component; keep today's page/title styles):

```tsx
export default async function NewEventPage() {
    if (!(await getMe())) redirect(`/login?next=${encodeURIComponent("/events/new")}`);

    return (/* page shell + heading */ <NewEventForm />);
}
```

- [ ] **Step 2: Edit** — `app/events/[id]/edit/page.tsx`:

```tsx
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const me = await getMe();
    if (!me) redirect(`/login?next=${encodeURIComponent(`/events/${id}/edit`)}`);

    const queryClient = getServerQueryClient();
    const event = await queryClient.fetchQuery(eventQueries.detail(id, serverRequest));
    if (!event) notFound();

    return (
        /* page shell + "Edit event" heading */
        canModifyEvent(me, event) ? (
            <HydrationBoundary state={dehydrate(queryClient)}>
                <EditEventForm id={id} />
            </HydrationBoundary>
        ) : (
            <p>Only the organizer or an admin can edit this event.</p>
        )
    );
}
```

`components/edit-event-form.tsx` (`"use client"`): `const { data: event } = useQuery(eventQueries.detail(id));` (hydrated), the existing update mutation (invalidate `eventKeys.all`, `router.push("/")`), `<EventForm initialValues={toFormValues(event)} …/>`.

- [ ] **Step 3: Verify** — checks, build, `pnpm test:e2e` (events.spec create/edit/delete with image upload through the proxy).

- [ ] **Step 4: Commit** `git add apps/web && git commit -m "Guard event pages on the server and hydrate the edit form from the cache"` + trailer.

---

### Task 6: Account — Server Actions

**Files:** `actions/account.ts`, `components/account-sections.tsx`, `app/account/page.tsx`.

- [ ] **Step 1: Actions** — `actions/account.ts` (`"use server"`), same helpers as Task 4 (export `textFields`, `apiFailure`, `post` from a shared `actions/shared.ts` rather than duplicating — DRY):

- `updateProfile(state, formData)` → `updateProfileInput` (`name` empty → `null`) → `PATCH /api/users/me` → `revalidatePath("/", "layout")` → `{ message: "Saved" }`
- `changePassword` → `changePasswordInput` → `POST /api/auth/password/change` → `{ message: "Password changed. Other devices have been signed out." }`
- `resendVerification` → `POST /api/auth/email/resend` → `{ message: "Sent. Check your inbox." }`
- `logoutAll` → `POST /api/auth/logout-all` → `applySessionCookie` + delete `sid` → `redirect("/login")`
- `deleteAccount` → `deleteAccountInput` → `DELETE /api/users/me` (JSON body) → on success `applySessionCookie` + delete `sid` → `redirect("/")`; wrong password → `{ formError }` from the API.

- [ ] **Step 2: Sections** — `components/account-sections.tsx` (`"use client"`): today's five sections from `app/account/page.tsx`, each a `<form action={formAction}>` with `useActionState(<action>, {})`; data from `useQuery(meQuery())` (hydrated). Keep the labels/ids (`name`, `currentPassword`, `newPassword`, `deletePassword`) and button texts.

- [ ] **Step 3: Page** — Server Component: `getMe()` → `redirect("/login?next=%2Faccount")` when null; renders the page shell + `<AccountSections />` (the layout already hydrated `me`).

- [ ] **Step 4: Unit tests** — `actions/account.test.ts`: `updateProfile` with an empty name sends `{ name: null }`; `deleteAccount` with a wrong password returns the API's message and does not redirect.

- [ ] **Step 5: Verify** — checks, build, e2e.

- [ ] **Step 6: Commit** `git add apps/web && git commit -m "Move the account page to Server Actions"` + trailer.

---

### Task 7: Cleanup, docs, SSR e2e

**Files:** delete `apps/web/app/lib/auth.ts` (and leftover `authApi` usages); `docs/architecture.md`, `docs/testing-conventions.md`; new `apps/e2e/tests/ssr.spec.ts`.

- [ ] **Step 1: Remove leftovers** — delete `lib/auth.ts` (+ its test file if empty); fix imports to `lib/session.ts` / `lib/queries.ts`. `grep -rn '"use client"' apps/web/app --include=page.tsx` must print nothing. `grep -rn "NEXT_PUBLIC_API_URL\|credentials: \"include\"\|useRequireUser\|window.location.assign" apps/web/app` must print nothing.

- [ ] **Step 2: e2e** — `apps/e2e/tests/ssr.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { API_URL, E2E_PASSWORD, e2eEmail } from "./support/auth.js";

test("the server HTML already contains the signed-in user and the events", async ({ request, baseURL }) => {
    const name = `E2E event ssr ${Date.now()}`;
    const created = await request.post(`${API_URL}/api/events`, { data: { name } });
    expect(created.status()).toBe(201);

    try {
        const html = await (await request.get(`${baseURL}/`)).text();
        expect(html).toContain("E2E runner");
        expect(html).toContain(name);
    } finally {
        expect((await request.delete(`${API_URL}/api/events/${(await created.json()).id}`)).status()).toBe(204);
    }
});

test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("a guarded page redirects in the HTTP response", async ({ request, baseURL }) => {
        const response = await request.get(`${baseURL}/events/new`, { maxRedirects: 0 });

        expect([303, 307, 308]).toContain(response.status());
        expect(response.headers().location).toContain("/login?next=%2Fevents%2Fnew");
    });
});

test.describe("without JavaScript", () => {
    test.use({ storageState: { cookies: [], origins: [] }, javaScriptEnabled: false });

    test("signing in works and the header shows the user", async ({ page, playwright }) => {
        const email = e2eEmail("nojs");
        const api = await playwright.request.newContext();
        expect((await api.post(`${API_URL}/api/auth/register`, { data: { email, password: E2E_PASSWORD } })).status()).toBe(201);

        try {
            await page.goto("/login");
            await page.getByLabel("Email").fill(email);
            await page.getByLabel("Password").fill(E2E_PASSWORD);
            await page.getByRole("button", { name: "Sign in" }).click();

            await expect(page).toHaveURL(/\/$/);
            await expect(page.getByRole("navigation", { name: "Account" })).toContainText(email);
        } finally {
            expect((await api.delete(`${API_URL}/api/users/me`, { data: { password: E2E_PASSWORD } })).status()).toBe(204);
            await api.dispose();
        }
    });
});
```

(`api` keeps the session from register, so its DELETE removes that user; adjust if the e2e support exposes a helper for this.)

- [ ] **Step 3: Docs** — `docs/architecture.md`:
  - Data flow: replace the diagram with the proxy/server-fetch/hydration picture from the spec.
  - "Web app routes": every page is a Server Component; list which client component each renders.
  - New section "Data on the web" — the default (server prefetch into TanStack Query via `lib/queries.ts`, `HydrationBoundary`, `getServerQueryClient`, `getMe`), and the mutation rule (Server Actions for simple forms, TanStack mutations for complex ones), cookies only in Server Actions, the renewal limitation.
  - Environment: remove `NEXT_PUBLIC_API_URL`; add `API_INTERNAL_URL` (web, server + dev rewrites), `API_PROXY` (web, `off` behind nginx), `SITE_URL` (web, `metadataBase`), `TRUSTED_PROXY` (api, default loopback, nginx's address in production).
  - CORS section: replace with "The browser reaches the API only on the web origin (dev: Next rewrites; prod: nginx); the API trusts `X-Forwarded-For` only from `TRUSTED_PROXY`."
  - New section "Deploying": production layout — nginx in front, `/api/` and `/uploads/` → Fastify, `/` → Next (`API_PROXY=off`), Fastify not public, `TRUSTED_PROXY` = nginx's address, `WEB_ORIGIN` = the public origin. Include this example:

```nginx
server {
    listen 443 ssl;
    server_name app.example.com;

    client_max_body_size 5m; # image uploads

    location /api/ {
        proxy_pass http://api:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://api:4000;
    }

    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
  `docs/testing-conventions.md`: Server Actions are unit-tested with `vi.mock("@/lib/api.server")` and `next/navigation`; e2e can assert server HTML with `request.get(baseURL…)`.

- [ ] **Step 4: Verify** — full `pnpm check-types && pnpm lint && pnpm test`, `pnpm --filter web build`, `pnpm test:e2e` twice; leftover check (no `e2e-%` users or `E2E%` events in the dev DB; nothing listening on 3000/4000).

- [ ] **Step 5: Commit** `git add apps/web apps/e2e docs && git commit -m "Remove the client auth layer, document server-rendered data, cover SSR end to end"` + trailer.
