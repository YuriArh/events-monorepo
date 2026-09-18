import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";

let app: FastifyInstance;

const createEvent = async (name: string) => {
    const response = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json" },
        payload: { name },
    });

    return response.json<{ id: string; name: string }>();
};

beforeAll(async () => {
    app = buildApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

describe("GET /api/events", () => {
    it("returns an empty list when there are no events", async () => {
        const response = await app.inject({ method: "GET", url: "/api/events" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual([]);
    });

    it("returns newest events first", async () => {
        await createEvent("first");
        await createEvent("second");

        const response = await app.inject({ method: "GET", url: "/api/events" });

        expect(response.statusCode).toBe(200);
        expect(response.json().map((event: { name: string }) => event.name)).toEqual(["second", "first"]);
    });
});

describe("POST /api/events", () => {
    it("creates an event", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: { name: "Team offsite" },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({ name: "Team offsite" });
        expect(response.json().id).toEqual(expect.any(String));
    });

    it("rejects an empty name with a validation error", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: { name: "" },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().message).toBe("Validation error");
    });
});

describe("GET /api/events/:id", () => {
    it("returns a single event", async () => {
        const created = await createEvent("Retro");

        const response = await app.inject({ method: "GET", url: `/api/events/${created.id}` });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ id: created.id, name: "Retro" });
    });

    it("returns 404 for an unknown id", async () => {
        const response = await app.inject({ method: "GET", url: "/api/events/missing" });

        expect(response.statusCode).toBe(404);
        expect(response.json().message).toContain("not found");
    });
});

describe("PATCH /api/events/:id", () => {
    it("updates the name", async () => {
        const created = await createEvent("Before");

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { name: "After" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ id: created.id, name: "After" });
    });

    it("returns 404 for an unknown id", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/api/events/missing",
            headers: { "content-type": "application/json" },
            payload: { name: "After" },
        });

        expect(response.statusCode).toBe(404);
    });
});

describe("DELETE /api/events/:id", () => {
    it("deletes the event", async () => {
        const created = await createEvent("Doomed");

        const response = await app.inject({ method: "DELETE", url: `/api/events/${created.id}` });

        expect(response.statusCode).toBe(204);

        const list = await app.inject({ method: "GET", url: "/api/events" });
        expect(list.json()).toEqual([]);
    });

    it("returns 404 for an unknown id", async () => {
        const response = await app.inject({ method: "DELETE", url: "/api/events/missing" });

        expect(response.statusCode).toBe(404);
    });

    // Regression: a bodyless DELETE that still declares a JSON content type used to
    // fail body parsing, and the error handler reported it as a 500.
    it("does not fail with a json content-type and no body", async () => {
        const created = await createEvent("Doomed");

        const response = await app.inject({
            method: "DELETE",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).not.toBe(500);
    });
});

describe("CORS", () => {
    // Regression: @fastify/cors defaults to GET,HEAD,POST, which silently blocked
    // every edit and delete from the browser.
    it.each(["PATCH", "DELETE"])("allows %s from the web origin", async (method) => {
        const response = await app.inject({
            method: "OPTIONS",
            url: "/api/events/some-id",
            headers: {
                origin: "http://localhost:3000",
                "access-control-request-method": method,
            },
        });

        expect(response.headers["access-control-allow-methods"]).toContain(method);
        expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    });
});
