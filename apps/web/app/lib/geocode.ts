import type { GeocodeResponse, GeocodeSuggestion } from "@repo/contracts";

import { request } from "./api";

export type { GeocodeSuggestion };

/**
 * What the form holds: a fresh Photon pick, or an address saved before
 * geocoding existed, which has no coordinates and no OSM id.
 *
 * These stay nullable rather than defaulting to 0. `lat: 0, lon: 0` is Null
 * Island off the coast of Africa, and on edit it would be written back over a
 * perfectly good row — a fabricated coordinate is worse than an absent one.
 */
export type AddressSelection = Omit<GeocodeSuggestion, "lat" | "lon" | "osmId"> & {
    lat: number | null;
    lon: number | null;
    osmId: string | null;
};

/** Mirrors the contract's `q.min(3)`. Shorter queries are never sent. */
export const MIN_QUERY_LENGTH = 3;

export const geocodeKeys = {
    search: (q: string) => ["geocode", q] as const,
};

export const geocodeApi = {
    search: (q: string) =>
        request<GeocodeResponse>(`/api/geocode?q=${encodeURIComponent(q)}`),
};

export type GeocodeState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; suggestionCount: number; filtered: number };

/**
 * The message shown when the list has nothing to offer, or null when the list
 * should speak for itself.
 *
 * There is no manual entry, so this message is the user's entire recourse. The
 * two empty outcomes must read differently: "nothing matched" invites a retype,
 * while "matches existed but all were filtered out" has to explain the filter,
 * otherwise searching a venue by name — the most common way to get here — is
 * indistinguishable from a typo.
 */
export const emptyStateMessage = (state: GeocodeState): string | null => {
    if (state.status === "error") {
        return "Address lookup is unavailable right now. You can still save the event without a venue.";
    }

    if (state.status !== "ready" || state.suggestionCount > 0) {
        return null;
    }

    return state.filtered > 0
        ? "Only street addresses can be selected. Try searching with a street name and number."
        : "Address not found. Try a different address.";
};
