import { describe, expect, it } from "vitest";

import { generateToken, hashToken } from "./crypto.js";

describe("generateToken", () => {
    it("is 32 random bytes, base64url-encoded", () => {
        expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("never repeats", () => {
        expect(generateToken()).not.toBe(generateToken());
    });
});

describe("hashToken", () => {
    it("is a deterministic sha256 hex digest", () => {
        expect(hashToken("abc")).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });
});
