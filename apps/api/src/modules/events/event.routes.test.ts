import { readdir, rm } from "node:fs/promises";

import { prisma } from "@repo/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { UPLOADS_DIR } from "../../lib/uploads.js";
import { makeAdmin, signUp } from "../../test/auth.js";

let app: FastifyInstance;

/** A signed-in user's session cookie; a fresh user per test (tables are truncated). */
let cookie: string;

const STARTS_AT = "2026-10-01T18:00:00.000Z";
const ENDS_AT = "2026-10-01T21:00:00.000Z";

const VENUE = {
    label: "Town Hall",
    line1: "1 Civic Square",
    city: "Amsterdam",
    country: "NL",
};

type EventPayload = {
    id: string;
    name: string;
    description: string | null;
    addressId: string | null;
    address: { id: string; label: string | null; city: string } | null;
    imageKey: string | null;
    startsAt: string;
    endsAt: string | null;
    organizerId: string | null;
};

const createEvent = async (overrides: Record<string, unknown> = {}) => {
    const response = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: { "content-type": "application/json", cookie },
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
        headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie },
        payload,
    });
};

beforeAll(async () => {
    app = buildApp({ rateLimits: false });
    await app.ready();
});

beforeEach(async () => {
    ({ cookie } = await signUp(app));
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
            headers: { "content-type": "application/json", cookie },
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
            headers: { "content-type": "application/json", cookie },
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
            headers: { "content-type": "application/json", cookie },
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
            headers: { "content-type": "application/json", cookie },
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
            headers: { "content-type": "application/json", cookie },
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
            headers: { "content-type": "application/json", cookie },
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
            headers: { "content-type": "application/json", cookie },
            payload: { startsAt: null, endsAt: STARTS_AT },
        });

        expect(response.statusCode).toBe(200);
    });

    it("returns 404 for an unknown id", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/api/events/missing",
            headers: { "content-type": "application/json", cookie },
            payload: { name: "After" },
        });

        expect(response.statusCode).toBe(404);
    });
});

describe("DELETE /api/events/:id", () => {
    it("deletes the event", async () => {
        const created = await createEvent();

        const response = await app.inject({ method: "DELETE", url: `/api/events/${created.id}`, headers: { cookie } });

        expect(response.statusCode).toBe(204);

        const list = await app.inject({ method: "GET", url: "/api/events" });
        expect(list.json()).toEqual([]);
    });

    it("returns 404 for an unknown id", async () => {
        const response = await app.inject({ method: "DELETE", url: "/api/events/missing", headers: { cookie } });

        expect(response.statusCode).toBe(404);
    });

    // Regression: a bodyless DELETE that still declares a JSON content type used to
    // fail body parsing, and the error handler reported it as a 500.
    it("does not fail with a json content-type and no body", async () => {
        const created = await createEvent();

        const response = await app.inject({
            method: "DELETE",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
        });

        expect(response.statusCode).not.toBe(500);
    });

    it("removes the uploaded image from disk", async () => {
        const { imageKey } = (await uploadFile(PNG_FIXTURE)).json<{ imageKey: string }>();
        const created = await createEvent({ imageKey });

        await app.inject({ method: "DELETE", url: `/api/events/${created.id}`, headers: { cookie } });

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
    // Without this the browser drops the session cookie on every API call.
    it("allows credentialed requests from the web origin", async () => {
        const response = await app.inject({
            method: "OPTIONS",
            url: "/api/events",
            headers: {
                origin: "http://localhost:3000",
                "access-control-request-method": "POST",
            },
        });

        expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

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

describe("event venue", () => {
    it("creates the venue with the event", async () => {
        const created = await createEvent({ address: VENUE });

        expect(created.address).toMatchObject({ label: "Town Hall", city: "Amsterdam" });
        expect(created.addressId).toBe(created.address?.id);
    });

    it("updates the venue in place", async () => {
        const created = await createEvent({ address: VENUE });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { address: { ...VENUE, city: "Rotterdam" } },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            addressId: created.addressId,
            address: { id: created.addressId, city: "Rotterdam" },
        });
        expect(await prisma.address.count()).toBe(1);
    });

    it("adds a venue to an event that had none", async () => {
        const created = await createEvent();

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { address: VENUE },
        });

        expect(response.json()).toMatchObject({ address: { city: "Amsterdam" } });
    });

    it("keeps the venue when address is omitted", async () => {
        const created = await createEvent({ address: VENUE });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { name: "Renamed" },
        });

        expect(response.json()).toMatchObject({ addressId: created.addressId });
    });

    it("deletes the venue row when address is null", async () => {
        const created = await createEvent({ address: VENUE });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { address: null },
        });

        expect(response.json()).toMatchObject({ addressId: null, address: null });
        expect(await prisma.address.count()).toBe(0);
    });

    // Addresses no longer outlive their event; before this, the e2e suite had
    // to clean up orphans by hand.
    it("deletes the venue with the event", async () => {
        const created = await createEvent({ address: VENUE });

        await app.inject({ method: "DELETE", url: `/api/events/${created.id}`, headers: { cookie } });

        expect(await prisma.address.count()).toBe(0);
    });

    it("round-trips coordinates and the raw feature", async () => {
        const raw = { type: "Feature", properties: { osm_id: 123456 } };

        const created = await createEvent({
            address: { ...VENUE, lat: 52.3723, lon: 4.9002, osmId: "W123456", raw },
        });

        expect(created.address).toMatchObject({ lat: 52.3723, osmId: "W123456", raw });
    });

    // Prisma needs DbNull rather than null for a nullable Json column.
    it("stores a venue with no geocoding fields", async () => {
        const created = await createEvent({ address: VENUE });

        expect(created.address).toMatchObject({ lat: null, lon: null, osmId: null, raw: null });
    });

    it.each([
        ["a missing line1", { line1: undefined }],
        ["a missing city", { city: undefined }],
        ["a missing country", { country: undefined }],
    ])("rejects a venue with %s, reporting the nested path", async (_label, overrides) => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json", cookie },
            payload: { name: "Valid", address: { ...VENUE, ...overrides } },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().issues[0].path[0]).toBe("address");
    });

    it("replaces the whole venue on update, clearing omitted fields", async () => {
        const created = await createEvent({
            address: {
                ...VENUE,
                line2: "Floor 2",
                region: "NH",
                postalCode: "1011 AB",
                lat: 52.3723,
                lon: 4.9002,
                osmId: "W123456",
                raw: { type: "Feature" },
            },
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { address: VENUE },
        });

        expect(response.json()).toMatchObject({
            addressId: created.addressId,
            address: {
                id: created.addressId,
                line2: null,
                region: null,
                postalCode: null,
                lat: null,
                lon: null,
                osmId: null,
                raw: null,
            },
        });
    });

    it("treats address null on an event with no venue as a no-op", async () => {
        const created = await createEvent();

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { address: null },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ addressId: null, address: null });
    });

    it("no longer exposes /api/addresses", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/addresses",
            headers: { "content-type": "application/json", cookie },
            payload: VENUE,
        });

        expect(response.statusCode).toBe(404);
    });
});

describe("ownership", () => {
    const patch = (id: string, sessionCookie?: string) =>
        app.inject({
            method: "PATCH",
            url: `/api/events/${id}`,
            headers: { "content-type": "application/json", ...(sessionCookie ? { cookie: sessionCookie } : {}) },
            payload: { name: "Hijacked", address: VENUE },
        });

    it("requires a session to create", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: { name: "Anonymous" },
        });

        expect(response.statusCode).toBe(401);
    });

    it("requires a session to upload", async () => {
        const response = await app.inject({ method: "POST", url: "/api/events/upload" });

        expect(response.statusCode).toBe(401);
    });

    it("makes the creator the organizer, ignoring one in the body", async () => {
        const other = await signUp(app);

        const created = await createEvent({ organizerId: other.user.id });
        const self = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });

        expect(created).toMatchObject({ organizerId: self.json().user.id });
    });

    it("forbids another user from editing, and leaves the event and venue as they were", async () => {
        const created = await createEvent({ address: VENUE });
        const stranger = await signUp(app);

        const response = await patch(created.id, stranger.cookie);

        expect(response.statusCode).toBe(403);
        const after = await app.inject({ method: "GET", url: `/api/events/${created.id}` });
        expect(after.json()).toMatchObject({ name: "Team offsite", address: { city: "Amsterdam" } });
    });

    it("forbids another user from deleting", async () => {
        const created = await createEvent();
        const stranger = await signUp(app);

        const response = await app.inject({
            method: "DELETE",
            url: `/api/events/${created.id}`,
            headers: { cookie: stranger.cookie },
        });

        expect(response.statusCode).toBe(403);
    });

    it("lets an admin edit and delete anyone's event", async () => {
        const created = await createEvent();
        const admin = await signUp(app);
        await makeAdmin(admin.user.id);

        expect((await patch(created.id, admin.cookie)).statusCode).toBe(200);
        const deletion = await app.inject({
            method: "DELETE",
            url: `/api/events/${created.id}`,
            headers: { cookie: admin.cookie },
        });
        expect(deletion.statusCode).toBe(204);
    });

    it("lets only an admin edit an event that has no organizer", async () => {
        const created = await createEvent();
        await prisma.event.update({ where: { id: created.id }, data: { organizerId: null } });

        expect((await patch(created.id, cookie)).statusCode).toBe(403);

        const admin = await signUp(app);
        await makeAdmin(admin.user.id);
        expect((await patch(created.id, admin.cookie)).statusCode).toBe(200);
    });

    it("rejects creating an event with an image another event already uses, keeping the file", async () => {
        const { imageKey } = (await uploadFile(PNG_FIXTURE)).json<{ imageKey: string }>();
        await createEvent({ imageKey });
        const other = await signUp(app);

        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json", cookie: other.cookie },
            payload: { name: "Stolen", imageKey },
        });

        expect(response.statusCode).toBe(409);
        await expect(readdir(UPLOADS_DIR)).resolves.toContain(imageKey);
    });

    it("rejects updating to an image another event already uses", async () => {
        const { imageKey } = (await uploadFile(PNG_FIXTURE)).json<{ imageKey: string }>();
        await createEvent({ imageKey });
        const other = await signUp(app);
        const mine = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json", cookie: other.cookie },
            payload: { name: "Mine" },
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${mine.json().id}`,
            headers: { "content-type": "application/json", cookie: other.cookie },
            payload: { imageKey },
        });

        expect(response.statusCode).toBe(409);
        await expect(readdir(UPLOADS_DIR)).resolves.toContain(imageKey);
    });

    // On a case-insensitive filesystem the upper-case variant names the same
    // file, so accepting it would let a stranger get the victim's image unlinked.
    it("rejects an upper-case variant of another event's image key, keeping the file", async () => {
        const { imageKey } = (await uploadFile(PNG_FIXTURE)).json<{ imageKey: string }>();
        await createEvent({ imageKey });
        const other = await signUp(app);

        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json", cookie: other.cookie },
            payload: { name: "Stolen", imageKey: imageKey.toUpperCase() },
        });

        expect(response.statusCode).toBe(400);
        await expect(readdir(UPLOADS_DIR)).resolves.toContain(imageKey);
    });

    it("accepts a PATCH that repeats the event's own image key, keeping the file", async () => {
        const { imageKey } = (await uploadFile(PNG_FIXTURE)).json<{ imageKey: string }>();
        const created = await createEvent({ imageKey });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { name: "Renamed", imageKey },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().imageKey).toBe(imageKey);
        await expect(readdir(UPLOADS_DIR)).resolves.toContain(imageKey);
    });

    it("keeps the event after a forbidden delete", async () => {
        const created = await createEvent();
        const stranger = await signUp(app);

        await app.inject({
            method: "DELETE",
            url: `/api/events/${created.id}`,
            headers: { cookie: stranger.cookie },
        });

        const after = await app.inject({ method: "GET", url: `/api/events/${created.id}` });
        expect(after.statusCode).toBe(200);
    });

    it("ignores an organizerId in a PATCH body", async () => {
        const created = await createEvent();
        const other = await signUp(app);

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json", cookie },
            payload: { name: "Renamed", organizerId: other.user.id },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().organizerId).toBe(created.organizerId);
    });

    it("is 401, not 403, when anonymous", async () => {
        const created = await createEvent();

        expect((await patch(created.id)).statusCode).toBe(401);
    });
});

describe("organizer in responses", () => {
    it("includes the organizer's id and name but never the email", async () => {
        const ada = await signUp(app, { name: "Ada Organizer" });
        const created = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json", cookie: ada.cookie },
            payload: { name: "Ada's event" },
        });

        const detail = await app.inject({ method: "GET", url: `/api/events/${created.json().id}` });
        const list = await app.inject({ method: "GET", url: "/api/events" });

        expect(detail.json().organizer).toEqual({ id: ada.user.id, name: "Ada Organizer" });
        expect(list.json()[0].organizer).toEqual({ id: ada.user.id, name: "Ada Organizer" });
        expect(detail.body).not.toContain(ada.email);
        expect(list.body).not.toContain(ada.email);
    });

    it("is null for an event without an organizer", async () => {
        const created = await createEvent();
        await prisma.event.update({ where: { id: created.id }, data: { organizerId: null } });

        const detail = await app.inject({ method: "GET", url: `/api/events/${created.id}` });

        expect(detail.json().organizer).toBeNull();
    });
});
