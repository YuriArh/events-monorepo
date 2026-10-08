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

    // Any HeadersInit shape; the caller's values win.
    const forwarded = new Headers(init?.headers);
    if (sid && !forwarded.has("cookie")) forwarded.set("cookie", `${SESSION_COOKIE}=${sid}`);
    if (forwardedFor && !forwarded.has("x-forwarded-for")) forwarded.set("x-forwarded-for", forwardedFor);

    return apiFetch(path, { ...init, headers: forwarded });
}

export const serverRequest: Fetcher = async (path, init) => readResponse(await serverFetch(path, init));

/**
 * Re-issues the API's session cookie on the web origin (sign-in, register,
 * renewal) or clears it (sign-out, account deletion); a no-op when the response
 * has none. Server Actions only (the actions' `send` calls it) — Next can't set
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
