import { createEventInput } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { NO_FIELDS, bannerFor, issuesByField, uncoveredMessage } from "./form-errors";

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

describe("bannerFor", () => {
    const rendered = new Set(["email"]);

    it("prefers the form-level error", () => {
        expect(bannerFor({ formError: "Too many requests", fieldErrors: { form: "x" } }, rendered)).toBe(
            "Too many requests",
        );
    });

    it("shows a field error no input renders", () => {
        expect(bannerFor({ fieldErrors: { email: "Bad email", token: "Missing" } }, rendered)).toBe("Missing");
    });

    it("puts every field error in the banner for a form without inputs", () => {
        expect(bannerFor({ fieldErrors: { token: "Missing" } }, NO_FIELDS)).toBe("Missing");
    });

    it("is null when the inline fields cover everything", () => {
        expect(bannerFor({ fieldErrors: { email: "Bad email" } }, rendered)).toBeNull();
        expect(bannerFor({}, rendered)).toBeNull();
    });
});
