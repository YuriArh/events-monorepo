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
});
