import { afterEach, describe, expect, it, vi } from "vitest";

import { request } from "./api";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("request", () => {
    // Same origin through the proxy (Next rewrites or nginx), so the session
    // cookie rides along without any cross-origin credentials setup.
    it("calls a relative /api URL in the browser", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        // The vitest environment is node; a `window` global is what marks the browser.
        vi.stubGlobal("window", {});

        await request("/api/anything");

        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/anything");
    });

    it("calls the API directly on the server", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await request("/api/anything");

        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/api/anything");
    });

    it("keeps headers the caller passes as a Headers instance", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await request("/api/anything", { method: "POST", body: "{}", headers: new Headers({ "x-custom": "1" }) });

        const sent = new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers);
        expect(sent.get("x-custom")).toBe("1");
        expect(sent.get("content-type")).toBe("application/json");
    });

    it("lets the caller's content-type win", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await request("/api/anything", { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } });

        const sent = new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers);
        expect(sent.get("content-type")).toBe("text/plain");
    });
});
