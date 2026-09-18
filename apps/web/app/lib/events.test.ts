import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eventsApi } from "./events";

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn();

const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
};

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("eventsApi.list", () => {
    it("requests the events collection and returns the parsed body", async () => {
        const events = [{ id: "1", name: "Retro", createdAt: "", updatedAt: "" }];
        fetchMock.mockResolvedValue(jsonResponse(events));

        await expect(eventsApi.list()).resolves.toEqual(events);
        expect(lastCall().url).toBe("http://api.test/api/events");
    });
});

describe("eventsApi.create", () => {
    it("posts the payload as json", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: "1", name: "Retro" }, 201));

        await eventsApi.create({ name: "Retro" });

        const { url, init, headers } = lastCall();
        expect(url).toBe("http://api.test/api/events");
        expect(init.method).toBe("POST");
        expect(init.body).toBe(JSON.stringify({ name: "Retro" }));
        expect(headers["Content-Type"]).toBe("application/json");
    });
});

describe("eventsApi.remove", () => {
    // Regression: sending a json content-type without a body made Fastify reject
    // the request while trying to parse it.
    it("omits the content-type header when there is no body", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

        await eventsApi.remove("abc");

        const { url, init, headers } = lastCall();
        expect(url).toBe("http://api.test/api/events/abc");
        expect(init.method).toBe("DELETE");
        expect(headers["Content-Type"]).toBeUndefined();
    });

    it("resolves without parsing a body on 204", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

        await expect(eventsApi.remove("abc")).resolves.toBeUndefined();
    });
});

describe("error handling", () => {
    it("surfaces the api error message", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: "Event not found" }, 404));

        await expect(eventsApi.list()).rejects.toThrow("Event not found");
    });

    it("falls back to the status code when the body is not json", async () => {
        fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

        await expect(eventsApi.list()).rejects.toThrow("Request failed with status 500");
    });
});
