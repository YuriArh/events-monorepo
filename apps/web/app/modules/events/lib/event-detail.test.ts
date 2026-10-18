import { describe, expect, it } from "vitest";

import { formatAddressLines, formatDate, formatEventWhen, osmEmbedUrl, osmLinkUrl } from "./event-detail";

describe("formatEventWhen", () => {
    it("shows one date and a time range for a same-day event", () => {
        expect(formatEventWhen("2026-10-01T18:00:00.000Z", "2026-10-01T21:00:00.000Z", "UTC")).toBe(
            "Thu, Oct 1, 2026 · 18:00 – 21:00",
        );
    });

    it("shows both dates when the event ends on another day", () => {
        expect(formatEventWhen("2026-10-01T18:00:00.000Z", "2026-10-02T10:00:00.000Z", "UTC")).toBe(
            "Thu, Oct 1, 2026 · 18:00 – Fri, Oct 2, 2026 · 10:00",
        );
    });

    it("shows only the start when there is no end", () => {
        expect(formatEventWhen("2026-10-01T18:00:00.000Z", null, "UTC")).toBe("Thu, Oct 1, 2026 · 18:00");
    });

    it("formats in the given time zone", () => {
        expect(formatEventWhen("2026-10-01T23:30:00.000Z", null, "Asia/Almaty")).toBe("Fri, Oct 2, 2026 · 04:30");
    });
});

describe("formatDate", () => {
    it("formats the day in UTC", () => {
        expect(formatDate("2026-10-01T23:30:00.000Z", "UTC")).toBe("Oct 1, 2026");
    });

    // Why it must not run during render: the server's zone and the viewer's can disagree on the day.
    it("formats the day in the given time zone", () => {
        expect(formatDate("2026-10-01T23:30:00.000Z", "Asia/Almaty")).toBe("Oct 2, 2026");
    });
});

describe("formatAddressLines", () => {
    it("drops empty parts and joins postal code with city", () => {
        expect(
            formatAddressLines({
                label: "Town Hall",
                line1: "1 Civic Square",
                line2: null,
                city: "Amsterdam",
                region: null,
                postalCode: "1011 AB",
                country: "NL",
            }),
        ).toEqual(["Town Hall", "1 Civic Square", "1011 AB Amsterdam", "NL"]);
    });
});

describe("osmEmbedUrl", () => {
    it("centres a small box on the point and drops a marker", () => {
        const url = new URL(osmEmbedUrl(52.3723, 4.9002));

        expect(url.origin + url.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
        expect(url.searchParams.get("bbox")).toBe("4.89520,52.36730,4.90520,52.37730");
        expect(url.searchParams.get("marker")).toBe("52.3723,4.9002");
    });
});

describe("osmLinkUrl", () => {
    it("links to the coordinates when known", () => {
        expect(osmLinkUrl({ lat: 52.3723, lon: 4.9002, line1: "x", city: "y", country: "z" })).toBe(
            "https://www.openstreetmap.org/?mlat=52.3723&mlon=4.9002#map=17/52.3723/4.9002",
        );
    });

    it("falls back to an address search", () => {
        expect(
            osmLinkUrl({ lat: null, lon: null, line1: "1 Civic Square", city: "Amsterdam", country: "NL" }),
        ).toBe("https://www.openstreetmap.org/search?query=1%20Civic%20Square%2C%20Amsterdam%2C%20NL");
    });
});
