import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
let incomingHeaders = new Headers();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => incomingHeaders }));

const { applySessionCookie, serverFetch } = await import("./api.server");

const fetchMock = vi.fn();

const sentHeaders = () => new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers);

beforeEach(() => {
    vi.clearAllMocks();
    incomingHeaders = new Headers();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("serverFetch", () => {
    it("forwards the visitor's session cookie and IP to the API", async () => {
        cookieStore.get.mockReturnValue({ name: "sid", value: "abc" });
        incomingHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });

        await serverFetch("/api/auth/me");

        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/api/auth/me");
        expect(sentHeaders().get("cookie")).toBe("sid=abc");
        expect(sentHeaders().get("x-forwarded-for")).toBe("203.0.113.7");
    });

    it("sends no cookie or forwarded IP when the visitor has none", async () => {
        cookieStore.get.mockReturnValue(undefined);

        await serverFetch("/api/auth/me");

        expect(sentHeaders().has("cookie")).toBe(false);
        expect(sentHeaders().has("x-forwarded-for")).toBe(false);
    });

    it("keeps headers the caller passes as a Headers instance", async () => {
        cookieStore.get.mockReturnValue({ name: "sid", value: "abc" });

        await serverFetch("/api/x", { headers: new Headers({ "x-custom": "1" }) });

        expect(sentHeaders().get("x-custom")).toBe("1");
        expect(sentHeaders().get("cookie")).toBe("sid=abc");
    });
});

const withSetCookie = (...cookies: string[]) => {
    const headers = new Headers();
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    return new Response(null, { status: 200, headers });
};

describe("applySessionCookie", () => {
    it("re-issues the API's session cookie on the web origin", async () => {
        await applySessionCookie(
            withSetCookie("sid=abc; Path=/; Expires=Fri, 01 Nov 2030 10:00:00 GMT; HttpOnly; SameSite=Lax; Secure"),
        );

        expect(cookieStore.set).toHaveBeenCalledWith("sid", "abc", {
            httpOnly: true,
            sameSite: "lax",
            secure: true,
            path: "/",
            expires: new Date("2030-11-01T10:00:00.000Z"),
        });
        expect(cookieStore.delete).not.toHaveBeenCalled();
    });

    it("deletes the cookie when the API empties it", async () => {
        await applySessionCookie(withSetCookie("sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"));

        expect(cookieStore.delete).toHaveBeenCalledWith("sid");
        expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it("leaves cookies alone when the response sets no session cookie", async () => {
        await applySessionCookie(withSetCookie("other=1; Path=/"));

        expect(cookieStore.set).not.toHaveBeenCalled();
        expect(cookieStore.delete).not.toHaveBeenCalled();
    });
});
