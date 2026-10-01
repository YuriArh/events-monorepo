import { describe, expect, it } from "vitest";

import { clientKey } from "./rate-limits.js";

describe("clientKey", () => {
    it("leaves IPv4 unchanged", () => {
        expect(clientKey("203.0.113.7")).toBe("203.0.113.7");
    });

    it("unwraps IPv4-mapped IPv6 to the IPv4 address", () => {
        expect(clientKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    });

    it("maps addresses in the same /64 to the same key", () => {
        expect(clientKey("2001:db8:1:2::1")).toBe(clientKey("2001:db8:1:2:ffff::9"));
    });

    it("maps addresses in different /64s to different keys", () => {
        expect(clientKey("2001:db8:1:2::1")).not.toBe(clientKey("2001:db8:1:3::1"));
    });

    it("treats compressed and expanded forms of one address alike", () => {
        expect(clientKey("2001:db8::1")).toBe(clientKey("2001:0db8:0000:0000:0000:0000:0000:0001"));
        expect(clientKey("::1")).toBe(clientKey("0:0:0:0:0:0:0:1"));
    });
});
