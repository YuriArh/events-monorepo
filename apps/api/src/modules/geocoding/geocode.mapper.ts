import type { GeocodeSuggestion } from "@repo/contracts";

/** The shape Photon actually returns. Everything is optional: property sets
 *  vary wildly by place type, which is what the filter below exists for. */
export type PhotonFeature = {
	type?: string;
	geometry?: { type?: string; coordinates?: number[] };
	properties?: Record<string, unknown>;
};

/** A present, non-blank string, or null. Photon omits keys and also ships
 *  whitespace-only values; both mean "absent" here. */
const text = (value: unknown): string | null => {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
};

/**
 * Maps one Photon feature to a suggestion, or null when it cannot fill the
 * three NOT NULL columns (line1, city, country) or has no coordinates.
 */
export const toSuggestion = (feature: PhotonFeature): GeocodeSuggestion | null => {
	const properties = feature.properties ?? {};

	const street = text(properties.street);
	const city = text(properties.city);
	const country = text(properties.country);

	if (!street || !city || !country) {
		return null;
	}

	const coordinates = feature.geometry?.coordinates;

	// GeoJSON orders coordinates [lon, lat], not [lat, lon].
	const lon = coordinates?.[0];
	const lat = coordinates?.[1];

	if (typeof lon !== "number" || typeof lat !== "number") {
		return null;
	}

	const osmType = text(properties.osm_type);
	const osmId = properties.osm_id;

	if (!osmType || (typeof osmId !== "number" && typeof osmId !== "string")) {
		return null;
	}

	const housenumber = text(properties.housenumber);
	const line1 = housenumber ? `${street} ${housenumber}` : street;

	return {
		osmId: `${osmType}${osmId}`,
		display: [line1, city, country].join(", "),
		line1,
		city,
		region: text(properties.state),
		postalCode: text(properties.postcode),
		country,
		lat,
		lon,
		raw: feature,
	};
};

/**
 * Maps a whole feature collection, reporting how many were dropped so the form
 * can tell "nothing matched" from "nothing usable matched".
 *
 * Duplicates do not count as filtered: they were usable, merely repeated.
 */
export const mapFeatures = (
	features: PhotonFeature[],
): { suggestions: GeocodeSuggestion[]; filtered: number } => {
	const suggestions: GeocodeSuggestion[] = [];
	const seen = new Set<string>();
	let filtered = 0;

	for (const feature of features) {
		const suggestion = toSuggestion(feature);

		if (!suggestion) {
			filtered += 1;
			continue;
		}

		if (seen.has(suggestion.osmId)) {
			continue;
		}

		seen.add(suggestion.osmId);
		suggestions.push(suggestion);
	}

	return { suggestions, filtered };
};
