import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@repo/db";

import { buildApp } from "../../app.js";
import { TEST_PASSWORD, sessionCookieFrom, signUp } from "../../test/auth.js";

let app: FastifyInstance;

beforeAll(async () => {
    app = buildApp({ rateLimits: false });
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

const me = (cookie: string) => app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });

/** A second session for the same user, as if from another device. */
const loginAgain = async (email: string, password = TEST_PASSWORD) =>
    sessionCookieFrom(
        await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } }),
    );

describe("PATCH /api/users/me", () => {
    it("changes the display name", async () => {
        const { cookie } = await signUp(app);

        const response = await app.inject({
            method: "PATCH",
            url: "/api/users/me",
            headers: { cookie },
            payload: { name: "Grace" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().user.name).toBe("Grace");
        expect(response.body).not.toContain("passwordHash");
    });

    it("requires a session", async () => {
        const response = await app.inject({ method: "PATCH", url: "/api/users/me", payload: { name: "X" } });

        expect(response.statusCode).toBe(401);
    });
});

describe("POST /api/auth/password/change", () => {
    const change = (cookie: string, currentPassword: string) =>
        app.inject({
            method: "POST",
            url: "/api/auth/password/change",
            headers: { cookie },
            payload: { currentPassword, newPassword: "a brand new password" },
        });

    it("keeps this session and ends the others", async () => {
        const { cookie, email } = await signUp(app);
        const otherDevice = await loginAgain(email);

        expect((await change(cookie, TEST_PASSWORD)).statusCode).toBe(204);

        expect((await me(cookie)).statusCode).toBe(200);
        expect((await me(otherDevice)).statusCode).toBe(401);
    });

    it("rejects a wrong current password", async () => {
        const { cookie } = await signUp(app);

        const response = await change(cookie, "not my password");

        expect(response.statusCode).toBe(400);
        expect(response.json().message).toBe("Current password is incorrect");
    });
});

describe("POST /api/auth/logout-all", () => {
    it("ends every session of the user", async () => {
        const { cookie, email } = await signUp(app);
        const otherDevice = await loginAgain(email);

        const response = await app.inject({ method: "POST", url: "/api/auth/logout-all", headers: { cookie } });

        expect(response.statusCode).toBe(204);
        expect((await me(cookie)).statusCode).toBe(401);
        expect((await me(otherDevice)).statusCode).toBe(401);
    });
});

describe("DELETE /api/users/me", () => {
    const remove = (cookie: string, password: string) =>
        app.inject({ method: "DELETE", url: "/api/users/me", headers: { cookie }, payload: { password } });

    it("deletes the account, its sessions, and keeps its events ownerless", async () => {
        const { cookie, user } = await signUp(app);
        const event = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { cookie },
            payload: { name: "Left behind" },
        });

        const response = await remove(cookie, TEST_PASSWORD);

        expect(response.statusCode).toBe(204);
        expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
        expect(await prisma.session.count()).toBe(0);
        const after = await prisma.event.findUniqueOrThrow({ where: { id: event.json().id } });
        expect(after.organizerId).toBeNull();
    });

    it("requires the password", async () => {
        const { cookie } = await signUp(app);

        expect((await remove(cookie, "not my password")).statusCode).toBe(400);
        expect(await prisma.user.count()).toBe(1);
    });
});
