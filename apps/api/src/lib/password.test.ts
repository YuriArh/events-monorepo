import { describe, expect, it } from "vitest";

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
