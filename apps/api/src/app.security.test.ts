import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { signUp } from "./test/auth.js";

let app: FastifyInstance;

beforeAll(async () => {
    // The only suite with limits on: everything else signs up far more than 5 times.
    app = buildApp({ rateLimits: true });
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

describe("rate limiting", () => {
    it("blocks the 6th login attempt for the same email within the window", async () => {
        const attempt = () =>
            app.inject({
                method: "POST",
                url: "/api/auth/login",
                payload: { email: "victim@example.test", password: "guess" },
            });

        for (let i = 0; i < 5; i += 1) {
            expect((await attempt()).statusCode).toBe(401);
        }

        const blocked = await attempt();
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toEqual({ message: "Too many attempts. Please try again later." });
        expect(blocked.headers["retry-after"]).toBeDefined();

        const variant = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            payload: { email: " Victim@Example.test ", password: "guess" },
        });
        expect(variant.statusCode).toBe(429);

        const other = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            payload: { email: "someone-else@example.test", password: "guess" },
        });
        expect(other.statusCode).toBe(401);
    });

    it("limits password-reset mail per email, whatever the address", async () => {
        const forgot = (remoteAddress: string) =>
            app.inject({
                method: "POST",
                url: "/api/auth/password/forgot",
                remoteAddress,
                payload: { email: "inbox@example.test" },
            });

        for (let i = 0; i < 3; i += 1) {
            expect((await forgot(`192.0.2.${i + 1}`)).statusCode).toBe(204);
        }

        expect((await forgot("192.0.2.99")).statusCode).toBe(429);
    });

    it("limits image uploads per user", async () => {
        const { cookie } = await signUp(app);
        // Rejected as 415 by the handler, so nothing is written, but still counted.
        const upload = () =>
            app.inject({
                method: "POST",
                url: "/api/events/upload",
                headers: { "content-type": "multipart/form-data; boundary=x", cookie },
                payload:
                    '--x\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n' +
                    "Content-Type: text/plain\r\n\r\nhi\r\n--x--\r\n",
            });

        for (let i = 0; i < 20; i += 1) {
            expect((await upload()).statusCode).toBe(415);
        }

        expect((await upload()).statusCode).toBe(429);
    });
});

describe("Origin check", () => {
    const createEvent = (cookie: string, origin?: string) =>
        app.inject({
            method: "POST",
            url: "/api/events",
            headers: { cookie, ...(origin ? { origin } : {}) },
            payload: { name: "Origin test" },
        });

    it("rejects a state-changing request from a foreign origin", async () => {
        const { cookie } = await signUp(app);

        const response = await createEvent(cookie, "https://evil.example");

        expect(response.statusCode).toBe(403);
    });

    it("accepts the web origin and requests with no Origin header", async () => {
        const { cookie } = await signUp(app);

        expect((await createEvent(cookie, "http://localhost:3000")).statusCode).toBe(201);
        expect((await createEvent(cookie)).statusCode).toBe(201);
    });

    it("does not apply to reads", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/api/events",
            headers: { origin: "https://evil.example" },
        });

        expect(response.statusCode).toBe(200);
    });
});

describe("behind the web proxy", () => {
    // The web app proxies browser calls and forwards the client's IP; without
    // trusting it, every visitor would share the proxy's rate-limit bucket.
    it("rate-limits by the forwarded client IP, not the proxy's", async () => {
        const attempt = (clientIp: string) =>
            app.inject({
                method: "POST",
                url: "/api/auth/login",
                remoteAddress: "127.0.0.1",
                headers: { "x-forwarded-for": clientIp },
                payload: { email: "proxied@example.test", password: "guess" },
            });

        for (let i = 0; i < 5; i += 1) {
            expect((await attempt("203.0.113.7")).statusCode).toBe(401);
        }

        expect((await attempt("203.0.113.7")).statusCode).toBe(429);
        expect((await attempt("198.51.100.9")).statusCode).toBe(401);
    });

    it("ignores X-Forwarded-For from an untrusted peer", async () => {
        const attempt = (spoofed: string) =>
            app.inject({
                method: "POST",
                url: "/api/auth/login",
                remoteAddress: "203.0.113.50",
                headers: { "x-forwarded-for": spoofed },
                payload: { email: "spoofed@example.test", password: "guess" },
            });

        for (let i = 0; i < 5; i += 1) {
            expect((await attempt(`198.51.100.${i + 1}`)).statusCode).toBe(401);
        }

        expect((await attempt("198.51.100.99")).statusCode).toBe(429);
    });
});
