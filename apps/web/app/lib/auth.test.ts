import { afterEach, describe, expect, it, vi } from "vitest";

import { authApi } from "./auth";

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ME = {
    id: "u1",
    email: "ada@example.test",
    name: "Ada",
    imageKey: null,
    role: "USER" as const,
    emailVerifiedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("authApi.me", () => {
    it("returns the user", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ user: ME })));

        await expect(authApi.me()).resolves.toEqual(ME);
    });

    // Signed out is a normal state, not an error the UI should show.
    it("returns null on 401", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse({ message: "Authentication required" }, 401)),
        );

        await expect(authApi.me()).resolves.toBeNull();
    });

    it("still throws on other failures", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

        await expect(authApi.me()).rejects.toThrow();
    });
});
