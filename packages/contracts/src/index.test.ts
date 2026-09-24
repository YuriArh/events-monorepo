import { describe, expect, it } from "vitest";

import { createAddressInput, geocodeQuery, geocodeResponse } from "./index.js";

describe("geocodeQuery", () => {
    it("coerces the limit from a query string and defaults it", () => {
        expect(geocodeQuery.parse({ q: "Nieuwmarkt" })).toEqual({ q: "Nieuwmarkt", limit: 8 });
        expect(geocodeQuery.parse({ q: "Nieuwmarkt", limit: "5" }).limit).toBe(5);
    });

    it("rejects a query shorter than three characters", () => {
        expect(geocodeQuery.safeParse({ q: "ni" }).success).toBe(false);
    });

    it("rejects a limit above ten", () => {
        expect(geocodeQuery.safeParse({ q: "Nieuwmarkt", limit: 50 }).success).toBe(false);
    });
});

describe("geocodeResponse", () => {
    const suggestion = {
        display: "Nieuwmarkt 4, Amsterdam, Netherlands",
        line1: "Nieuwmarkt 4",
        city: "Amsterdam",
        region: "North Holland",
        postalCode: "1012 CR",
        country: "Netherlands",
        lat: 52.3723,
        lon: 4.9002,
        osmId: "W123456",
        raw: { type: "Feature" },
    };

    it("accepts a filtered count alongside suggestions", () => {
        const parsed = geocodeResponse.parse({ suggestions: [suggestion], filtered: 3 });

        expect(parsed.suggestions[0]?.osmId).toBe("W123456");
        expect(parsed.filtered).toBe(3);
    });

    it("rejects a suggestion missing a required structured field", () => {
        const { city, ...withoutCity } = suggestion;

        expect(geocodeResponse.safeParse({ suggestions: [withoutCity], filtered: 0 }).success).toBe(
            false,
        );
    });
});

describe("createAddressInput geocoding fields", () => {
    it("accepts coordinates and the raw feature", () => {
        const parsed = createAddressInput.parse({
            line1: "Nieuwmarkt 4",
            city: "Amsterdam",
            country: "Netherlands",
            lat: 52.3723,
            lon: 4.9002,
            osmId: "W123456",
            raw: { type: "Feature", properties: { city: "Amsterdam" } },
        });

        expect(parsed.lat).toBe(52.3723);
        expect(parsed.osmId).toBe("W123456");
    });

    it("still accepts an address with no geocoding fields at all", () => {
        const parsed = createAddressInput.parse({
            line1: "1 Civic Square",
            city: "Amsterdam",
            country: "NL",
        });

        expect(parsed.lat ?? null).toBeNull();
    });
});
