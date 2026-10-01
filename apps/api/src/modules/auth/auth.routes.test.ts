import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@repo/db";

import { buildApp } from "../../app.js";
import { hashToken } from "../../lib/crypto.js";
import { TEST_PASSWORD, sessionCookieFrom, signUp } from "../../test/auth.js";

let app: FastifyInstance;

beforeAll(async () => {
    app = buildApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

const me = (cookie?: string) =>
    app.inject({ method: "GET", url: "/api/auth/me", headers: cookie ? { cookie } : {} });

const login = (email: string, password: string) =>
    app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });

describe("POST /api/auth/register", () => {
    it("creates the user and signs them in", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            payload: { email: "  Ada@Example.TEST ", password: TEST_PASSWORD, name: "Ada" },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().user).toMatchObject({
            email: "ada@example.test",
            name: "Ada",
            role: "USER",
            emailVerifiedAt: null,
        });

        const setCookie = String(response.headers["set-cookie"]);
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Lax");

        const current = await me(sessionCookieFrom(response));
        expect(current.statusCode).toBe(200);
        expect(current.json().user.email).toBe("ada@example.test");
    });

    it("rejects an email that is taken, ignoring case", async () => {
        await signUp(app, { email: "taken@example.test" });

        const response = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            payload: { email: "TAKEN@example.test", password: TEST_PASSWORD },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json().message).toBe("Email already registered");
    });

    it.each([
        ["a short password", { password: "short" }],
        ["a password over 128 characters", { password: "x".repeat(129) }],
        ["an invalid email", { email: "not-an-email" }],
    ])("rejects %s", async (_label, overrides) => {
        const response = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            payload: { email: "valid@example.test", password: TEST_PASSWORD, ...overrides },
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("POST /api/auth/login", () => {
    it("signs in with the right password and starts a new session", async () => {
        const { email } = await signUp(app);

        const response = await login(email.toUpperCase(), TEST_PASSWORD);

        expect(response.statusCode).toBe(200);
        expect(response.json().user.email).toBe(email);
        expect(await prisma.session.count()).toBe(2);
    });

    it("gives the same answer for a wrong password and an unknown email", async () => {
        const { email } = await signUp(app);

        const wrongPassword = await login(email, "wrong password");
        const unknownEmail = await login("nobody@example.test", "wrong password");

        expect(wrongPassword.statusCode).toBe(401);
        expect(unknownEmail.statusCode).toBe(401);
        expect(wrongPassword.json()).toEqual({ message: "Invalid email or password" });
        expect(unknownEmail.json()).toEqual(wrongPassword.json());
    });
});

describe("sessions", () => {
    it("stores only a hash of the cookie token", async () => {
        const { cookie } = await signUp(app);
        const token = cookie.slice("sid=".length);

        const session = await prisma.session.findFirstOrThrow();

        expect(session.tokenHash).not.toBe(token);
        expect(session.tokenHash).toBe(hashToken(token));
    });

    it("rejects an expired session and deletes it", async () => {
        const { cookie } = await signUp(app);
        await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

        const response = await me(cookie);

        expect(response.statusCode).toBe(401);
        expect(await prisma.session.count()).toBe(0);
    });

    it("renews a session that was last extended over a day ago", async () => {
        const { cookie } = await signUp(app);
        const tenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
        await prisma.session.updateMany({ data: { expiresAt: tenDays } });

        const response = await me(cookie);

        expect(response.headers["set-cookie"]).toBeDefined();
        const session = await prisma.session.findFirstOrThrow();
        expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    });

    it("does not rewrite a fresh session on every request", async () => {
        const { cookie } = await signUp(app);

        const response = await me(cookie);

        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("treats an unknown cookie as anonymous", async () => {
        expect((await me("sid=forged")).statusCode).toBe(401);
    });
});

describe("POST /api/auth/logout", () => {
    it("ends the session", async () => {
        const { cookie } = await signUp(app);

        const response = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });

        expect(response.statusCode).toBe(204);
        expect(String(response.headers["set-cookie"])).toContain("sid=;");
        expect((await me(cookie)).statusCode).toBe(401);
    });

    it("succeeds without a session", async () => {
        const response = await app.inject({ method: "POST", url: "/api/auth/logout" });

        expect(response.statusCode).toBe(204);
    });
});

describe("GET /api/auth/me", () => {
    it("is 401 when anonymous", async () => {
        const response = await me();

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Authentication required" });
    });

    it("never returns the password hash", async () => {
        const { cookie } = await signUp(app);

        const body = (await me(cookie)).body;

        expect(body).not.toContain("passwordHash");
        expect(body).not.toContain("$argon2");
    });
});
