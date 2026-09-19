import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";

let app: FastifyInstance;

const VENUE = {
    label: "Town Hall",
    line1: "1 Civic Square",
    city: "Amsterdam",
    country: "NL",
};

const createAddress = async (overrides: Record<string, unknown> = {}) => {
    const response = await app.inject({
        method: "POST",
        url: "/api/addresses",
        headers: { "content-type": "application/json" },
        payload: { ...VENUE, ...overrides },
    });

    return response.json<{ id: string; label: string | null; city: string }>();
};

const createEvent = async (overrides: Record<string, unknown> = {}) => {
    const response = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json" },
        payload: { name: "Team offsite", ...overrides },
    });

    return response;
};

beforeAll(async () => {
    app = buildApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

describe("POST /api/addresses", () => {
    it("creates a venue", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/addresses",
            headers: { "content-type": "application/json" },
            payload: VENUE,
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({ label: "Town Hall", city: "Amsterdam", country: "NL" });
        expect(response.json()).toMatchObject({ line2: null, region: null, postalCode: null });
    });

    it.each([
        ["a missing line1", { line1: undefined }],
        ["a missing city", { city: undefined }],
        ["a missing country", { country: undefined }],
    ])("rejects %s", async (_label, overrides) => {
        const response = await app.inject({
            method: "POST",
            url: "/api/addresses",
            headers: { "content-type": "application/json" },
            payload: { ...VENUE, ...overrides },
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("GET /api/addresses", () => {
    it("lists venues ordered by city", async () => {
        await createAddress({ city: "Rotterdam", label: "Riverside" });
        await createAddress({ city: "Amsterdam", label: "Town Hall" });

        const response = await app.inject({ method: "GET", url: "/api/addresses" });

        expect(response.statusCode).toBe(200);
        expect(response.json().map((address: { city: string }) => address.city)).toEqual([
            "Amsterdam",
            "Rotterdam",
        ]);
    });
});

describe("linking events to a venue", () => {
    it("embeds the address in the event response", async () => {
        const address = await createAddress();

        const response = await createEvent({ addressId: address.id });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            addressId: address.id,
            address: { label: "Town Hall", city: "Amsterdam" },
        });
    });

    it("lets several events share one venue", async () => {
        const address = await createAddress();

        await createEvent({ name: "first", addressId: address.id });
        await createEvent({ name: "second", addressId: address.id });

        const response = await app.inject({ method: "GET", url: "/api/events" });
        const linked = response.json().filter((event: { addressId: string }) => event.addressId === address.id);

        expect(linked).toHaveLength(2);
    });

    // Without the up-front check this surfaces as a raw foreign-key violation,
    // which the error handler would report as a 500.
    it("rejects an addressId that does not exist", async () => {
        const response = await createEvent({ addressId: "does-not-exist" });

        expect(response.statusCode).toBe(400);
        expect(response.json().message).toContain("does not exist");
    });

    it("detaches the venue when set to null", async () => {
        const address = await createAddress();
        const event = (await createEvent({ addressId: address.id })).json<{ id: string }>();

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${event.id}`,
            headers: { "content-type": "application/json" },
            payload: { addressId: null },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ addressId: null, address: null });
    });
});

describe("DELETE /api/addresses/:id", () => {
    // onDelete: SetNull — removing a venue must not cascade into its events.
    it("keeps the events and clears their link", async () => {
        const address = await createAddress();
        const event = (await createEvent({ addressId: address.id })).json<{ id: string }>();

        const deletion = await app.inject({ method: "DELETE", url: `/api/addresses/${address.id}` });
        expect(deletion.statusCode).toBe(204);

        const response = await app.inject({ method: "GET", url: `/api/events/${event.id}` });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ addressId: null, address: null });
    });

    it("returns 404 for an unknown id", async () => {
        const response = await app.inject({ method: "DELETE", url: "/api/addresses/missing" });

        expect(response.statusCode).toBe(404);
    });
});
