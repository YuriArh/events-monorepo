import { describe, expect, it } from "vitest";

import { canModify } from "./event.service.js";

const owner = { id: "u1", role: "USER" as const };
const stranger = { id: "u2", role: "USER" as const };
const admin = { id: "a1", role: "ADMIN" as const };

describe("canModify", () => {
    it.each([
        ["the organizer", { organizerId: "u1" }, owner, true],
        ["another user", { organizerId: "u1" }, stranger, false],
        ["an admin", { organizerId: "u1" }, admin, true],
        ["a user, on an ownerless event", { organizerId: null }, owner, false],
        ["an admin, on an ownerless event", { organizerId: null }, admin, true],
    ])("%s → %s", (_label, event, actor, expected) => {
        expect(canModify(event, actor)).toBe(expected);
    });
});
