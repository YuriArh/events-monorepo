import { readdir, rm } from "node:fs/promises";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { UPLOADS_DIR } from "../../lib/uploads.js";

let app: FastifyInstance;

const STARTS_AT = "2026-10-01T18:00:00.000Z";
const ENDS_AT = "2026-10-01T21:00:00.000Z";

type EventPayload = {
    id: string;
    name: string;
    description: string | null;
    addressId: string | null;
    imageKey: string | null;
    startsAt: string;
    endsAt: string | null;
};

const createEvent = async (overrides: Record<string, unknown> = {}) => {
    const response = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json" },
        payload: { name: "Team offsite", startsAt: STARTS_AT, ...overrides },
    });

    return response.json<EventPayload>();
};

/** A 1x1 png, small enough to inline. */
const PNG_FIXTURE = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);

const uploadFile = async (content: Buffer, { filename = "photo.png", contentType = "image/png" } = {}) => {
    const boundary = "----vitest";
    const payload = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
                `Content-Type: ${contentType}\r\n\r\n`,
        ),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    return app.inject({
        method: "POST",
        url: "/api/events/upload",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload,
    });
};

beforeAll(async () => {
    app = buildApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
    await rm(UPLOADS_DIR, { recursive: true, force: true });
});

describe("GET /api/events", () => {
    it("returns an empty list when there are no events", async () => {
        const response = await app.inject({ method: "GET", url: "/api/events" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual([]);
    });

    it("orders events by when they start", async () => {
        await createEvent({ name: "later", startsAt: "2026-12-01T10:00:00.000Z" });
        await createEvent({ name: "sooner", startsAt: "2026-11-01T10:00:00.000Z" });

        const response = await app.inject({ method: "GET", url: "/api/events" });

        expect(response.json().map((event: EventPayload) => event.name)).toEqual(["sooner", "later"]);
    });
});

describe("POST /api/events", () => {
    it("creates an event with the full contract", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: {
                name: "Team offsite",
                description: "Two days offsite",
                startsAt: STARTS_AT,
                endsAt: ENDS_AT,
            },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            name: "Team offsite",
            description: "Two days offsite",
            imageKey: null,
        });
        expect(new Date(response.json().startsAt).toISOString()).toBe(STARTS_AT);
    });

    it("defaults the optional fields to null", async () => {
        const created = await createEvent();

        expect(created).toMatchObject({ description: null, addressId: null, imageKey: null, endsAt: null });
    });

    it("rejects an endsAt that is not after startsAt", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: { name: "Backwards", startsAt: ENDS_AT, endsAt: STARTS_AT },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().message).toContain("endsAt must be after startsAt");
    });

    // Both dates are optional, so there is nothing to compare against and the
    // lone endsAt is accepted rather than rejected.
    it("allows an endsAt when startsAt is absent", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: { name: "Open ended", endsAt: ENDS_AT },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({ startsAt: null });
    });

    it.each([
        ["an empty name", { name: "" }],
        ["a non-date startsAt", { startsAt: "not-a-date" }],
        ["an image key that looks like a path", { imageKey: "../../etc/passwd" }],
    ])("rejects %s", async (_label, overrides) => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: { name: "Valid", startsAt: STARTS_AT, ...overrides },
        });

        expect(response.statusCode).toBe(400);
    });

});

describe("PATCH /api/events/:id", () => {
    it("updates a subset of fields", async () => {
        const created = await createEvent({ description: "before" });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { description: "after" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ name: created.name, description: "after" });
    });

    // Checked against the merged entity: this payload is only invalid once
    // combined with the startsAt already stored.
    it("rejects an endsAt before the stored startsAt", async () => {
        const created = await createEvent({ startsAt: ENDS_AT });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { endsAt: STARTS_AT },
        });

        expect(response.statusCode).toBe(400);
    });

    // Clearing startsAt removes the thing endsAt would be compared against, so
    // the pair becomes valid again.
    it("allows clearing startsAt alongside an earlier endsAt", async () => {
        const created = await createEvent({ startsAt: ENDS_AT });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { startsAt: null, endsAt: STARTS_AT },
        });

        expect(response.statusCode).toBe(200);
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
        const created = await createEvent();

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
        const created = await createEvent();

        const response = await app.inject({
            method: "DELETE",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).not.toBe(500);
    });

    it("removes the uploaded image from disk", async () => {
        const { imageKey } = (await uploadFile(PNG_FIXTURE)).json<{ imageKey: string }>();
        const created = await createEvent({ imageKey });

        await app.inject({ method: "DELETE", url: `/api/events/${created.id}` });

        await expect(readdir(UPLOADS_DIR)).resolves.not.toContain(imageKey);
    });
});

describe("POST /api/events/upload", () => {
    it("stores an image and returns a generated key", async () => {
        const response = await uploadFile(PNG_FIXTURE);

        expect(response.statusCode).toBe(201);

        const { imageKey } = response.json<{ imageKey: string }>();
        expect(imageKey).toMatch(/^[a-f0-9]{32}\.png$/);

        await expect(readdir(UPLOADS_DIR)).resolves.toContain(imageKey);
    });

    // The client filename is never trusted: the key is generated server-side, so
    // a traversal attempt cannot escape the uploads directory.
    it("ignores the client filename", async () => {
        const response = await uploadFile(PNG_FIXTURE, { filename: "../../escaped.png" });

        const { imageKey } = response.json<{ imageKey: string }>();
        expect(imageKey).not.toContain("/");
        expect(imageKey).not.toContain("..");
    });

    it("rejects a non-image content type", async () => {
        const response = await uploadFile(Buffer.from("#!/bin/sh"), {
            filename: "payload.sh",
            contentType: "application/x-sh",
        });

        expect(response.statusCode).toBe(415);
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
