import { describe, expect, it } from "vitest";

import { mapFeatures, toSuggestion, type PhotonFeature } from "./geocode.mapper.js";

const feature = (properties: Record<string, unknown>, coordinates = [4.9002, 52.3723]): PhotonFeature => ({
	type: "Feature",
	geometry: { type: "Point", coordinates },
	properties,
});

const complete = {
	osm_type: "W",
	osm_id: 123456,
	street: "Nieuwmarkt",
	housenumber: "4",
	city: "Amsterdam",
	state: "North Holland",
	postcode: "1012 CR",
	country: "Netherlands",
};

describe("toSuggestion", () => {
	it("maps a complete feature", () => {
		const result = toSuggestion(feature(complete));

		expect(result).toEqual({
			osmId: "W123456",
			display: "Nieuwmarkt 4, Amsterdam, Netherlands",
			line1: "Nieuwmarkt 4",
			city: "Amsterdam",
			region: "North Holland",
			postalCode: "1012 CR",
			country: "Netherlands",
			lat: 52.3723,
			lon: 4.9002,
			raw: feature(complete),
		});
	});

	it("omits the house number when there isn't one", () => {
		const { housenumber, ...withoutNumber } = complete;

		expect(toSuggestion(feature(withoutNumber))?.line1).toBe("Nieuwmarkt");
	});

	it("nulls the optional fields rather than dropping the result", () => {
		const { state, postcode, ...sparse } = complete;
		const result = toSuggestion(feature(sparse));

		expect(result?.region).toBeNull();
		expect(result?.postalCode).toBeNull();
	});

	// These three are the whole reason the filter exists: line1, city and
	// country are NOT NULL and there is no manual entry to fall back on.
	it.each(["street", "city", "country"])("rejects a feature with no %s", (key) => {
		const { [key]: _removed, ...incomplete } = complete;

		expect(toSuggestion(feature(incomplete))).toBeNull();
	});

	it("rejects a feature with no usable coordinates", () => {
		expect(toSuggestion(feature(complete, []))).toBeNull();
	});

	it("rejects a feature whose fields are blank rather than absent", () => {
		expect(toSuggestion(feature({ ...complete, city: "   " }))).toBeNull();
	});
});

describe("mapFeatures", () => {
	it("counts what it dropped", () => {
		const { street, ...noStreet } = complete;

		const result = mapFeatures([
			feature(complete),
			feature(noStreet),
			feature({ ...noStreet, name: "Vondelpark" }),
		]);

		expect(result.suggestions).toHaveLength(1);
		expect(result.filtered).toBe(2);
	});

	it("deduplicates by osm id, keeping upstream order", () => {
		const result = mapFeatures([
			feature(complete),
			feature({ ...complete, street: "Nieuwmarkt", housenumber: "4" }),
			feature({ ...complete, osm_id: 999, street: "Damrak", housenumber: "1" }),
		]);

		expect(result.suggestions.map((item) => item.osmId)).toEqual(["W123456", "W999"]);
		// A duplicate is not a filtered-out result — it was usable, just repeated.
		expect(result.filtered).toBe(0);
	});

	it("returns an empty result for no features", () => {
		expect(mapFeatures([])).toEqual({ suggestions: [], filtered: 0 });
	});
});
