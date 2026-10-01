export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Matches the shape `issuesByField` (in lib/event-form.ts) expects. */
export type ApiIssue = { path: PropertyKey[]; message: string };

/**
 * Thrown by `request()` on a non-2xx response. Carries the server's `issues`
 * array (present on a Zod validation 400, see `apps/api/src/app.ts`) so
 * callers can map them onto form fields instead of only showing the
 * top-level message.
 */
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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
        ...init,
        // The session is an httpOnly cookie set by the API's origin; without
        // this the browser neither sends nor stores it on cross-origin calls.
        credentials: "include",
        headers: {
            // Only on requests that actually carry a JSON body. Sending it with an
            // empty body makes Fastify reject the request while parsing, and setting
            // it on FormData destroys the multipart boundary.
            ...(init?.body && typeof init.body === "string"
                ? { "Content-Type": "application/json" }
                : {}),
            ...init?.headers,
        },
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
            body?.message ?? `Request failed with status ${response.status}`,
            response.status,
            Array.isArray(body?.issues) ? body.issues : undefined,
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}
