import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));
// Like the real one: redirect never returns, it throws a control-flow error.
vi.mock("next/navigation", () => ({
    RedirectType: { push: "push", replace: "replace" },
    redirect: vi.fn((url: string) => {
        throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
    }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api.server", () => ({ serverFetch: vi.fn(), applySessionCookie: vi.fn() }));

const { redirect } = await import("next/navigation");
const { revalidatePath } = await import("next/cache");
const { applySessionCookie, serverFetch } = await import("@/lib/api.server");
const { changePassword, deleteAccount, logoutAll, resendVerification, updateProfile } = await import("./account");

const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
};

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const sentInit = (call = 0) => vi.mocked(serverFetch).mock.calls[call]?.[1];
const sentBody = (call = 0) => JSON.parse(String(sentInit(call)?.body));

beforeEach(() => {
    vi.clearAllMocks();
});

describe("updateProfile", () => {
    it("sends a null name when the field is empty", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(200, { user: {} }));

        const state = await updateProfile({}, form({ name: "   " }));

        expect(vi.mocked(serverFetch).mock.calls[0]?.[0]).toBe("/api/users/me");
        expect(sentInit()?.method).toBe("PATCH");
        expect(sentBody()).toEqual({ name: null });
        expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
        expect(state).toEqual({ message: "Saved", values: { name: "" } });
    });

    // The API renews a session at most daily, on whichever request comes first;
    // a renewal answered to a Server Action must reach the browser too.
    it("relays a renewed session cookie", async () => {
        const response = json(200, { user: {} });
        vi.mocked(serverFetch).mockResolvedValue(response);

        await updateProfile({}, form({ name: "Ann" }));

        expect(applySessionCookie).toHaveBeenCalledWith(response);
    });
});

describe("changePassword", () => {
    it("rejects a short new password without calling the API", async () => {
        const state = await changePassword({}, form({ currentPassword: "old-password", newPassword: "short" }));

        expect(state.fieldErrors?.newPassword).toBeDefined();
        expect(state.values).toBeUndefined();
        expect(serverFetch).not.toHaveBeenCalled();
    });

    it("shows the API's refusal as the banner", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(400, { message: "Current password is incorrect" }));

        const state = await changePassword({}, form({ currentPassword: "wrong-password", newPassword: "new-password" }));

        expect(state.formError).toBe("Current password is incorrect");
    });

    it("confirms a change", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        const state = await changePassword({}, form({ currentPassword: "old-password", newPassword: "new-password" }));

        expect(state).toEqual({ message: "Password changed. Other devices have been signed out." });
    });
});

describe("resendVerification", () => {
    it("confirms the new link", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        expect(await resendVerification({}, form({}))).toEqual({ message: "Sent. Check your inbox." });
    });

    it("shows a rate-limit message as the banner", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(429, { message: "Too many requests" }));

        expect((await resendVerification({}, form({}))).formError).toBe("Too many requests");
    });

    // The same text as for an unreachable API (see auth.test.ts).
    it("falls back to the generic message for an error without one", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

        expect((await resendVerification({}, form({}))).formError).toBe("Something went wrong. Please try again.");
    });
});

describe("logoutAll", () => {
    it("clears the session cookie and redirects to sign-in", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        await expect(logoutAll({}, form({}))).rejects.toThrow("NEXT_REDIRECT");

        expect(applySessionCookie).toHaveBeenCalled();
        expect(cookieStore.delete).toHaveBeenCalledWith("sid");
        expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("stays signed in when the API refuses", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(429, { message: "Too many requests" }));

        const state = await logoutAll({}, form({}));

        expect(state.formError).toBe("Too many requests");
        expect(redirect).not.toHaveBeenCalled();
        expect(cookieStore.delete).not.toHaveBeenCalled();
    });
});

describe("deleteAccount", () => {
    it("returns the API's message for a wrong password and does not redirect", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(400, { message: "Password is incorrect" }));

        const state = await deleteAccount({}, form({ password: "wrong-password" }));

        expect(state.formError).toBe("Password is incorrect");
        expect(sentInit()?.method).toBe("DELETE");
        expect(sentBody()).toEqual({ password: "wrong-password" });
        expect(redirect).not.toHaveBeenCalled();
        expect(cookieStore.delete).not.toHaveBeenCalled();
    });

    it("clears the session cookie and redirects home on success", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        await expect(deleteAccount({}, form({ password: "right-password" }))).rejects.toThrow("NEXT_REDIRECT");

        expect(applySessionCookie).toHaveBeenCalled();
        expect(cookieStore.delete).toHaveBeenCalledWith("sid");
        expect(redirect).toHaveBeenCalledWith("/");
    });
});
