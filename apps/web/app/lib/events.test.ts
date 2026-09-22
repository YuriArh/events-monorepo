import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addressesApi, eventsApi, uploadImage } from "./events";

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

describe("eventsApi.get", () => {
    it("requests a single event", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: "1", name: "Retro" }));

        await eventsApi.get("1");

        expect(lastCall().url).toBe("http://api.test/api/events/1");
    });
});

describe("uploadImage", () => {
    it("posts multipart form data without a json content-type", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ imageKey: "abc.png" }, 201));

        const file = new File(["x"], "photo.png", { type: "image/png" });
        await expect(uploadImage(file)).resolves.toEqual({ imageKey: "abc.png" });

        const { url, init, headers } = lastCall();
        expect(url).toBe("http://api.test/api/events/upload");
        expect(init.method).toBe("POST");
        expect(init.body).toBeInstanceOf(FormData);
        // The browser sets the multipart boundary itself; forcing a content-type breaks it.
        expect(headers["Content-Type"]).toBeUndefined();
    });
});

describe("addressesApi", () => {
    it("creates an address", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: "a1" }, 201));

        await addressesApi.create({ line1: "1 Civic Square", city: "Amsterdam", country: "NL" });

        const { url, init } = lastCall();
        expect(url).toBe("http://api.test/api/addresses");
        expect(init.method).toBe("POST");
    });

    it("updates an address", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: "a1" }));

        await addressesApi.update("a1", { city: "Rotterdam" });

        const { url, init } = lastCall();
        expect(url).toBe("http://api.test/api/addresses/a1");
        expect(init.method).toBe("PATCH");
    });
});
