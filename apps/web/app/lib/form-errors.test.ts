import { describe, expect, it } from "vitest";

import { uncoveredMessage } from "./form-errors";

describe("uncoveredMessage", () => {
    const rendered = new Set(["email", "password"]);

    it("returns the message of a key no field renders", () => {
        expect(uncoveredMessage({ email: "Bad email", form: "Broken" }, rendered)).toBe("Broken");
    });

    it("returns null when every key has a field", () => {
        expect(uncoveredMessage({ email: "Bad email", password: "Too short" }, rendered)).toBeNull();
    });
});
