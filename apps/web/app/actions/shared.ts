import { applySessionCookie, serverFetch } from "@/lib/api.server";
import { issuesByField } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";

/*
 * Helpers shared by the Server Action files. Deliberately not a "use server"
 * module: that would turn every export into a public action endpoint.
 */

/** Text fields of a form submission. */
export const textFields = (formData: FormData) =>
    Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<
        string,
        string
    >;

/** The banner when there is nothing more specific to say. */
const FALLBACK_ERROR = "Something went wrong. Please try again.";

/** The API's error, mapped onto the form: 400 issues per field, anything else as the banner. */
export const apiFailure = async (response: Response, values?: Record<string, string>): Promise<FormState> => {
    const body = await response.json().catch(() => null);
    return Array.isArray(body?.issues)
        ? { fieldErrors: issuesByField(body.issues), values }
        : { formError: body?.message ?? FALLBACK_ERROR, values };
};

/**
 * Calls the API with a JSON body (or none) and relays its session cookie to
 * the browser whatever the status: sign-in sets it, sign-out clears it, and any
 * request may renew it. An unreachable API (connection refused, DNS) becomes a
 * 503 the form shows as its banner, instead of the action throwing into Next's
 * error page.
 */
export const send = async (method: string, path: string, body?: unknown) => {
    let response: Response;
    try {
        response = await serverFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
        console.error(`${method} ${path}: API call failed`, error);
        return new Response(JSON.stringify({ message: FALLBACK_ERROR }), { status: 503 });
    }

    await applySessionCookie(response);
    return response;
};

export const post = (path: string, body?: unknown) => send("POST", path, body);
