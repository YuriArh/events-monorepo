import { describe, expect, it } from "vitest";

import { MemoryMailer } from "./mailer.js";

describe("MemoryMailer", () => {
    it("pulls the token out of the latest link sent to an address", async () => {
        const mailer = new MemoryMailer();
        await mailer.send({ to: "a@example.test", subject: "x", text: "https://w/reset?token=old_1" });
        await mailer.send({ to: "a@example.test", subject: "x", text: "https://w/reset?token=new-2" });

        expect(mailer.tokenFor("a@example.test")).toBe("new-2");
    });

    it("throws when nothing was sent to the address", () => {
        expect(() => new MemoryMailer().tokenFor("nobody@example.test")).toThrow();
    });
});
