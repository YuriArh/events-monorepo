import argon2 from "argon2";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password.js";

describe("password hashing", () => {
    it("produces an argon2id hash, not the password", async () => {
        const hash = await hashPassword("correct horse battery");

        expect(hash).toMatch(/^\$argon2id\$/);
        expect(hash).not.toContain("correct horse battery");
    });

    it("verifies the right password and rejects a wrong one", async () => {
        const hash = await hashPassword("correct horse battery");

        await expect(verifyPassword(hash, "correct horse battery")).resolves.toBe(true);
        await expect(verifyPassword(hash, "wrong")).resolves.toBe(false);
    });

    it("treats a malformed hash as a failed match rather than throwing", async () => {
        await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
    });

    it("always fails the dummy check", async () => {
        await expect(verifyAgainstDummy("anything")).resolves.toBe(false);
    });
});

describe("dummy hash", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** A fresh copy of the module, so its load-time work runs under the spy. */
    const loadPassword = async () => {
        vi.resetModules();
        return import("./password.js");
    };

    it("is computed when the module loads, not on the first unknown-email login", async () => {
        const hash = vi.spyOn(argon2, "hash");

        await loadPassword();

        expect(hash).toHaveBeenCalledTimes(1);
    });

    it("does not cache a failed computation", async () => {
        const hash = vi.spyOn(argon2, "hash").mockRejectedValueOnce(new Error("out of memory"));

        const fresh = await loadPassword();

        await expect(fresh.verifyAgainstDummy("anything")).resolves.toBe(false);
        await expect(fresh.verifyAgainstDummy("anything")).resolves.toBe(false);
        expect(hash).toHaveBeenCalledTimes(2);
    });
});
