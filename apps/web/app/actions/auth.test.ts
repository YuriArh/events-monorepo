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
const { forgotPassword, login, logout, register, resetPassword, verifyEmail } = await import("./auth");

const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
};

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The JSON body of the n-th serverFetch call. */
const sentBody = (call = 0) => JSON.parse(String(vi.mocked(serverFetch).mock.calls[call]?.[1]?.body));

beforeEach(() => {
    vi.clearAllMocks();
});

describe("logout", () => {
    // Signing out must work on this origin even when the API is unreachable.
    it("clears the session cookie and redirects even if the API call fails", async () => {
        vi.mocked(serverFetch).mockRejectedValue(new TypeError("fetch failed"));

        await expect(logout()).rejects.toThrow("NEXT_REDIRECT");

        expect(cookieStore.delete).toHaveBeenCalledWith("sid");
        expect(redirect).toHaveBeenCalledWith("/");
    });

    it("clears the session cookie and redirects after a normal sign-out", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        await expect(logout()).rejects.toThrow("NEXT_REDIRECT");

        expect(cookieStore.delete).toHaveBeenCalledWith("sid");
        expect(redirect).toHaveBeenCalledWith("/");
    });
});

describe("login", () => {
    it("rejects an invalid email without calling the API, echoing the email but never the password", async () => {
        const state = await login({}, form({ email: "not-an-email", password: "secret-pw", next: "/" }));

        expect(state.fieldErrors?.email).toBeDefined();
        expect(state.values).toEqual({ email: "not-an-email" });
        expect(state.values).not.toHaveProperty("password");
        expect(serverFetch).not.toHaveBeenCalled();
    });

    it("shows the API's refusal as the banner", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(401, { message: "Invalid email or password" }));

        const state = await login({}, form({ email: "a@example.com", password: "wrong", next: "/" }));

        expect(state).toEqual({ formError: "Invalid email or password", values: { email: "a@example.com" } });
    });

    it("shows a banner, not an error page, when the API is unreachable", async () => {
        vi.mocked(serverFetch).mockRejectedValue(new TypeError("fetch failed"));
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        const state = await login({}, form({ email: "a@example.com", password: "secret-pw", next: "/" }));
        consoleError.mockRestore();

        expect(state).toEqual({
            formError: "Something went wrong. Please try again.",
            values: { email: "a@example.com" },
        });
        expect(applySessionCookie).not.toHaveBeenCalled();
        expect(redirect).not.toHaveBeenCalled();
    });

    it("relays the session cookie and redirects to the safe next path", async () => {
        const response = json(200, { user: {} });
        vi.mocked(serverFetch).mockResolvedValue(response);

        await expect(
            login({}, form({ email: " A@Example.com ", password: "secret-pw", next: "/events/new" })),
        ).rejects.toThrow("NEXT_REDIRECT");

        expect(serverFetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST" }));
        // The contract's normalised email; the hidden `next` is not sent to the API.
        expect(sentBody()).toEqual({ email: "a@example.com", password: "secret-pw" });
        expect(applySessionCookie).toHaveBeenCalledWith(response);
        expect(redirect).toHaveBeenCalledWith("/events/new", "replace");
    });

    it("never redirects off-site", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(200, { user: {} }));

        await expect(
            login({}, form({ email: "a@example.com", password: "secret-pw", next: "//evil.example" })),
        ).rejects.toThrow("NEXT_REDIRECT");

        expect(redirect).toHaveBeenCalledWith("/", "replace");
    });
});

describe("register", () => {
    it("rejects a short password, echoing name and email but never the password", async () => {
        const state = await register({}, form({ name: "Ann", email: "a@example.com", password: "short" }));

        expect(state.fieldErrors?.password).toBeDefined();
        expect(state.values).toEqual({ name: "Ann", email: "a@example.com" });
        expect(serverFetch).not.toHaveBeenCalled();
    });

    it("puts a taken email on the email field", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(409, { message: "Email already registered" }));

        const state = await register({}, form({ name: "", email: "a@example.com", password: "long-enough" }));

        expect(state.fieldErrors).toEqual({ email: "Email already registered" });
        expect(state.values).toEqual({ name: "", email: "a@example.com" });
    });

    it("maps the API's validation issues onto fields", async () => {
        vi.mocked(serverFetch).mockResolvedValue(
            json(400, { message: "Invalid input", issues: [{ path: ["email"], message: "Bad email" }] }),
        );

        const state = await register({}, form({ email: "a@example.com", password: "long-enough" }));

        expect(state.fieldErrors).toEqual({ email: "Bad email" });
    });

    it("sends no name for an empty one, relays the cookie and goes home", async () => {
        const response = json(201, { user: {} });
        vi.mocked(serverFetch).mockResolvedValue(response);

        await expect(
            register({}, form({ name: "  ", email: "a@example.com", password: "long-enough" })),
        ).rejects.toThrow("NEXT_REDIRECT");

        expect(sentBody()).toEqual({ email: "a@example.com", password: "long-enough" });
        expect(applySessionCookie).toHaveBeenCalledWith(response);
        expect(redirect).toHaveBeenCalledWith("/", "replace");
    });
});

describe("forgotPassword", () => {
    it("answers the same message whenever the API accepts", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        const state = await forgotPassword({}, form({ email: "a@example.com" }));

        expect(state.message).toMatch(/If an account exists/);
        expect(serverFetch).toHaveBeenCalledWith("/api/auth/password/forgot", expect.anything());
    });

    it("keeps the typed email on a validation error", async () => {
        const state = await forgotPassword({}, form({ email: "nope" }));

        expect(state.fieldErrors?.email).toBeDefined();
        expect(state.values).toEqual({ email: "nope" });
    });

    it("shows a rate limit as the banner", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(429, { message: "Too many requests" }));

        const state = await forgotPassword({}, form({ email: "a@example.com" }));

        expect(state.formError).toBe("Too many requests");
    });
});

describe("resetPassword", () => {
    it("shows the API's refusal of a used token", async () => {
        vi.mocked(serverFetch).mockResolvedValue(json(400, { message: "This link has expired" }));

        const state = await resetPassword({}, form({ token: "t", newPassword: "long-enough" }));

        expect(state).toEqual({ formError: "This link has expired" });
    });

    it("confirms and refreshes the signed-in state (sessions were revoked)", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        const state = await resetPassword({}, form({ token: "t", newPassword: "long-enough" }));

        expect(sentBody()).toEqual({ token: "t", newPassword: "long-enough" });
        expect(state.message).toMatch(/password has been changed/);
        expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });
});

describe("verifyEmail", () => {
    it("refuses a missing token without calling the API", async () => {
        const state = await verifyEmail({}, form({ token: "" }));

        expect(state.formError).toMatch(/missing its token/);
        expect(serverFetch).not.toHaveBeenCalled();
    });

    it("confirms and refreshes the signed-in state", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        const state = await verifyEmail({}, form({ token: "t" }));

        expect(state).toEqual({ message: "Your email is confirmed." });
        expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });
});
