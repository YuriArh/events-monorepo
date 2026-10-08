import { createEventInput } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { issuesByField, uncoveredMessage } from "./form-errors";

describe("issuesByField", () => {
    it("keys zod issues by their field path", () => {
        const result = createEventInput.safeParse({ name: "" });

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(issuesByField(result.error.issues)).toHaveProperty("name");
    });

    it("puts path-less issues under the form key", () => {
        expect(issuesByField([{ path: [], message: "bad" }])).toEqual({ form: "bad" });
    });
});

describe("uncoveredMessage", () => {
    const rendered = new Set(["email", "password"]);

    it("returns the message of a key no field renders", () => {
        expect(uncoveredMessage({ email: "Bad email", form: "Broken" }, rendered)).toBe("Broken");
    });

    it("returns null when every key has a field", () => {
        expect(uncoveredMessage({ email: "Bad email", password: "Too short" }, rendered)).toBeNull();
    });
});
