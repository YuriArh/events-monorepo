import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { geocodeService } from "./geocode.service.js";

let app: FastifyInstance;

const fetchMock = vi.fn();

const photonFeature = (properties: Record<string, unknown>) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [4.9002, 52.3723] },
    properties,
});

const COMPLETE = {
    osm_type: "W",
    osm_id: 123456,
    street: "Nieuwmarkt",
    housenumber: "4",
    city: "Amsterdam",
    country: "Netherlands",
};

const photonResponse = (features: unknown[]) =>
    new Response(JSON.stringify({ type: "FeatureCollection", features }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

const search = (query: string) => app.inject({ method: "GET", url: `/api/geocode?${query}` });

beforeAll(async () => {
    app = buildApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // The cache is process-wide; without this a test sees the previous one's result.
    geocodeService.clearCache();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("GET /api/geocode", () => {
    it("returns mapped suggestions", async () => {
        fetchMock.mockResolvedValue(photonResponse([photonFeature(COMPLETE)]));

        const response = await search("q=Nieuwmarkt");
        const body = response.json<{ suggestions: Array<{ display: string }>; filtered: number }>();

        expect(response.statusCode).toBe(200);
        expect(body.suggestions[0]?.display).toBe("Nieuwmarkt 4, Amsterdam, Netherlands");
        expect(body.filtered).toBe(0);
    });

    it("reports how many results were unusable", async () => {
        const { street, ...noStreet } = COMPLETE;
        fetchMock.mockResolvedValue(
            photonResponse([photonFeature({ ...noStreet, name: "Vondelpark" })]),
        );

        const body = (await search("q=Vondelpark")).json<{
            suggestions: unknown[];
            filtered: number;
        }>();

        expect(body.suggestions).toEqual([]);
        expect(body.filtered).toBe(1);
    });

    it("identifies this application to the upstream service", async () => {
        fetchMock.mockResolvedValue(photonResponse([]));

        await search("q=Nieuwmarkt");

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;

        expect(headers["User-Agent"]).toMatch(/eventapp/);
    });

    it("serves a repeated query from cache without calling upstream again", async () => {
        fetchMock.mockResolvedValue(photonResponse([photonFeature(COMPLETE)]));

        await search("q=Nieuwmarkt");
        await search("q=Nieuwmarkt");

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a query shorter than three characters", async () => {
        const response = await search("q=ni");

        expect(response.statusCode).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 503 when the upstream service fails", async () => {
        fetchMock.mockRejectedValue(new Error("network down"));

        const response = await search("q=Nieuwmarkt");

        expect(response.statusCode).toBe(503);
        expect(response.json<{ message: string }>().message).toMatch(/unavailable/i);
    });

    it("returns 503 when the upstream service answers with an error status", async () => {
        fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

        expect((await search("q=Nieuwmarkt")).statusCode).toBe(503);
    });

    it("does not cache a failure", async () => {
        fetchMock.mockRejectedValueOnce(new Error("network down"));
        fetchMock.mockResolvedValue(photonResponse([photonFeature(COMPLETE)]));

        expect((await search("q=Nieuwmarkt")).statusCode).toBe(503);
        expect((await search("q=Nieuwmarkt")).statusCode).toBe(200);
    });
});
