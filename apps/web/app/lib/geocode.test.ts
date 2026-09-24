import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyStateMessage, geocodeApi, geocodeKeys, MIN_QUERY_LENGTH } from "./geocode";

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("geocodeApi.search", () => {
    it("requests the geocode endpoint with an encoded query", async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ suggestions: [], filtered: 0 }), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );

        await geocodeApi.search("Nieuwmarkt 4, Amsterdam");

        const [url] = fetchMock.mock.calls[0] as [string];

        expect(url).toBe("http://api.test/api/geocode?q=Nieuwmarkt%204%2C%20Amsterdam");
    });
});

describe("geocodeKeys", () => {
    it("keys by the query so distinct searches are cached separately", () => {
        expect(geocodeKeys.search("dam")).not.toEqual(geocodeKeys.search("damrak"));
    });
});

// These three states look identical to a user if they share one message, and
// they call for different reactions: retype, rephrase, or try again later.
describe("emptyStateMessage", () => {
    it("says nothing while the query is too short", () => {
        expect(emptyStateMessage({ status: "idle" })).toBeNull();
    });

    it("says nothing while loading", () => {
        expect(emptyStateMessage({ status: "loading" })).toBeNull();
    });

    it("says nothing when there are suggestions", () => {
        expect(
            emptyStateMessage({ status: "ready", suggestionCount: 3, filtered: 0 }),
        ).toBeNull();
    });

    it("reports a plain miss when upstream matched nothing", () => {
        const message = emptyStateMessage({ status: "ready", suggestionCount: 0, filtered: 0 });

        expect(message).toBe("Address not found. Try a different address.");
    });

    it("explains the filter when matches existed but none were usable", () => {
        const message = emptyStateMessage({ status: "ready", suggestionCount: 0, filtered: 4 });

        // A user who searched for a park or a venue by name needs to know why
        // a place they know exists isn't listed — otherwise it reads as a typo.
        expect(message).toMatch(/only street addresses/i);
    });

    it("blames the service, not the address, on failure", () => {
        const message = emptyStateMessage({ status: "error" });

        expect(message).toMatch(/unavailable/i);
        expect(message).not.toMatch(/not found/i);
    });
});

describe("MIN_QUERY_LENGTH", () => {
    it("matches the contract's floor", () => {
        expect(MIN_QUERY_LENGTH).toBe(3);
    });
});
