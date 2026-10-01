import { afterEach, describe, expect, it, vi } from "vitest";

import { request } from "./api";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("request", () => {
    // Without this the browser neither sends nor stores the API's session
    // cookie on a cross-origin fetch, and every user looks signed out.
    it("sends credentials", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await request("/api/anything");

        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
    });
});
