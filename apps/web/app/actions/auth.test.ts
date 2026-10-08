import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/api.server", () => ({ serverFetch: vi.fn(), applySessionCookie: vi.fn() }));

const { redirect } = await import("next/navigation");
const { serverFetch } = await import("@/lib/api.server");
const { logout } = await import("./auth");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("logout", () => {
    // Signing out must work on this origin even when the API is unreachable.
    it("clears the session cookie and redirects even if the API call fails", async () => {
        vi.mocked(serverFetch).mockRejectedValue(new TypeError("fetch failed"));

        await logout();

        expect(cookieStore.delete).toHaveBeenCalledWith("sid");
        expect(redirect).toHaveBeenCalledWith("/");
    });

    it("clears the session cookie and redirects after a normal sign-out", async () => {
        vi.mocked(serverFetch).mockResolvedValue(new Response(null, { status: 204 }));

        await logout();

        expect(cookieStore.delete).toHaveBeenCalledWith("sid");
        expect(redirect).toHaveBeenCalledWith("/");
    });
});
