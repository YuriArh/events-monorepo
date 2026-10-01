import { afterEach, describe, expect, it, vi } from "vitest";

import { authApi, canModifyEvent, safeNext } from "./auth";

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

describe("safeNext", () => {
    it.each([
        ["/events/new", "/events/new"],
        ["/events/abc/edit?x=1", "/events/abc/edit?x=1"],
        [null, "/"],
        [undefined, "/"],
        ["", "/"],
        // Open-redirect attempts: all must stay on this site.
        ["https://evil.example", "/"],
        ["//evil.example", "/"],
        ["/\\evil.example", "/"],
        ["javascript:alert(1)", "/"],
        // The URL parser strips tab/LF/CR, so these resolve to "//evil.example".
        ["/\t/evil.example", "/"],
        ["/\n/evil.example", "/"],
        ["/\r/evil.example", "/"],
        [" //evil.example", "/"],
        // Dot-segment normalisation can leave a protocol-relative path behind.
        ["/.//evil.example", "/"],
        ["/..//evil.example", "/"],
        ["/a/..//evil.example", "/"],
        // These make `new URL` throw rather than resolve.
        ["//", "/"],
        ["///", "/"],
    ])("%s → %s", (input, expected) => {
        expect(safeNext(input)).toBe(expected);
    });
});

describe("canModifyEvent", () => {
    it.each([
        ["signed out", null, { organizerId: "u1" }, false],
        ["the organizer", ME, { organizerId: "u1" }, true],
        ["another user", ME, { organizerId: "u2" }, false],
        ["a user, ownerless event", ME, { organizerId: null }, false],
        ["an admin", { ...ME, role: "ADMIN" as const }, { organizerId: "u2" }, true],
    ])("%s → %s", (_label, me, event, expected) => {
        expect(canModifyEvent(me, event)).toBe(expected);
    });
});
