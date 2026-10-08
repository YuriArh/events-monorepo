/** Matches the shape `issuesByField` (in lib/form-errors.ts) expects. */
export type ApiIssue = { path: PropertyKey[]; message: string };

/**
 * Thrown on a non-2xx response. Carries the server's `issues` array (present
 * on a Zod validation 400, see `apps/api/src/app.ts`) so callers can map them
 * onto form fields instead of only showing the top-level message.
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

export type Fetcher = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Browser: same origin, through the proxy (next.config rewrites or nginx), so
 * the session cookie rides along by itself. Server: straight to the API.
 */
export const apiBaseUrl = () =>
    typeof window === "undefined" ? (process.env.API_INTERNAL_URL ?? "http://localhost:4000") : "";

export const apiFetch = (path: string, init?: RequestInit) => {
    // Any HeadersInit shape (object, array, Headers); the caller's values win.
    const headers = new Headers(init?.headers);
    // Only on requests that actually carry a JSON body: an empty body makes
    // Fastify reject the request, and FormData needs its own boundary.
    if (init?.body && typeof init.body === "string" && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
    }

    return fetch(`${apiBaseUrl()}${path}`, { cache: "no-store", ...init, headers });
};

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
