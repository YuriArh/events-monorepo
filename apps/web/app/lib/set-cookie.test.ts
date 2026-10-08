import { describe, expect, it } from "vitest";

import { parseSessionSetCookie } from "./set-cookie";

describe("parseSessionSetCookie", () => {
    it("reads the value and expiry of the session cookie", () => {
        expect(
            parseSessionSetCookie([
                "other=1; Path=/",
                "sid=abc123; Path=/; Expires=Fri, 01 Nov 2030 10:00:00 GMT; HttpOnly; SameSite=Lax",
            ]),
        ).toEqual({ value: "abc123", expires: new Date("2030-11-01T10:00:00.000Z"), secure: false });
    });

    it("notices Secure", () => {
        expect(parseSessionSetCookie(["sid=x; Path=/; HttpOnly; Secure"])?.secure).toBe(true);
    });

    it("treats an emptied cookie as a deletion", () => {
        expect(parseSessionSetCookie(["sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"])).toEqual({
            value: "",
            expires: new Date(0),
            secure: false,
        });
    });

    it("is null when the response sets no session cookie", () => {
        expect(parseSessionSetCookie(["other=1"])).toBeNull();
    });
});
