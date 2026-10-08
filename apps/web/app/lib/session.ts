import type { UserPublic } from "@repo/contracts";

export type Me = UserPublic;

/** The API's session cookie; same-origin for the browser, so the web server sees it too. */
export const SESSION_COOKIE = "sid";

/**
 * Only same-site relative paths. Anything else — an absolute URL, a
 * protocol-relative "//host", "/\host", or "/\t/host" (the URL parser strips
 * tab/LF/CR, leaving "//host") — would turn the login page into an open redirect.
 */
export const safeNext = (next: string | null | undefined) => {
    if (!next?.startsWith("/")) return "/";
    // Resolve against a dummy origin the way the browser would; anything that
    // escapes it (//host, /\host, control-char tricks) is not a same-site path.
    let resolved: URL;
    try {
        resolved = new URL(next, "http://same.invalid");
    } catch {
        // "//" and "///" are unparseable; fall back rather than crash the page.
        return "/";
    }
    if (resolved.origin !== "http://same.invalid") return "/";
    const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    // Dot segments ("/.//host") normalise to a protocol-relative path.
    return path.startsWith("//") || path.startsWith("/\\") ? "/" : path;
};

/** Mirrors the API's `canModify`. Hides controls; the API is what enforces it. */
export const canModifyEvent = (me: Me | null | undefined, event: { organizerId: string | null }) =>
    !!me && (me.role === "ADMIN" || (event.organizerId !== null && event.organizerId === me.id));
