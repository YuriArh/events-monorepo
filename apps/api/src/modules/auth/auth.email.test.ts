import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@repo/db";

import { buildApp } from "../../app.js";
import { type Mailer, MemoryMailer } from "../../lib/mailer.js";
import { TEST_PASSWORD, signUp } from "../../test/auth.js";

let app: FastifyInstance;
let mailer: MemoryMailer;

beforeAll(async () => {
    mailer = new MemoryMailer();
    app = buildApp({ mailer, rateLimits: false });
    await app.ready();
});

beforeEach(() => {
    mailer.messages.length = 0;
});

afterAll(async () => {
    await app.close();
});

const post = (url: string, payload: unknown, cookie?: string) =>
    app.inject({ method: "POST", url, payload: payload as object, headers: cookie ? { cookie } : {} });

const NEW_PASSWORD = "a brand new password";

/** The forgot endpoint answers before the mail is sent, so wait for it to arrive. */
const mailArrived = (count: number) => vi.waitFor(() => expect(mailer.messages.length).toBe(count));

describe("email verification", () => {
    it("mails a link on registration and verifies with it", async () => {
        const { email, cookie } = await signUp(app);

        expect(mailer.messages[0]?.text).toContain("http://localhost:3000/verify-email?token=");

        const response = await post("/api/auth/email/verify", { token: mailer.tokenFor(email) });

        expect(response.statusCode).toBe(204);
        const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
        expect(me.json().user.emailVerifiedAt).not.toBeNull();
    });

    it("rejects a used link", async () => {
        const { email } = await signUp(app);
        const token = mailer.tokenFor(email);

        expect((await post("/api/auth/email/verify", { token })).statusCode).toBe(204);
        const second = await post("/api/auth/email/verify", { token });

        expect(second.statusCode).toBe(400);
        expect(second.json().message).toBe("This link is invalid or has expired");
    });

    it("resends a fresh link and retires the old one", async () => {
        const { email, cookie } = await signUp(app);
        const first = mailer.tokenFor(email);

        expect((await post("/api/auth/email/resend", {}, cookie)).statusCode).toBe(204);
        const second = mailer.tokenFor(email);

        expect(second).not.toBe(first);
        expect((await post("/api/auth/email/verify", { token: first })).statusCode).toBe(400);
        expect((await post("/api/auth/email/verify", { token: second })).statusCode).toBe(204);
    });

    it("requires a session to resend", async () => {
        expect((await post("/api/auth/email/resend", {})).statusCode).toBe(401);
    });
});

describe("password reset", () => {
    it("answers 204 for known and unknown emails, but only mails the known one", async () => {
        const { email } = await signUp(app);
        mailer.messages.length = 0;

        const known = await post("/api/auth/password/forgot", { email });
        const unknown = await post("/api/auth/password/forgot", { email: "nobody@example.test" });
        await mailArrived(1);

        expect(known.statusCode).toBe(204);
        expect(unknown.statusCode).toBe(204);
        expect(mailer.messages.map((message) => message.to)).toEqual([email]);
    });

    it("sets the new password once and signs out every session", async () => {
        const { email, cookie } = await signUp(app);
        const other = await signUp(app);
        mailer.messages.length = 0;
        await post("/api/auth/password/forgot", { email });
        await mailArrived(1);
        const token = mailer.tokenFor(email);

        const reset = await post("/api/auth/password/reset", { token, newPassword: NEW_PASSWORD });

        expect(reset.statusCode).toBe(204);
        const otherMe = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: other.cookie } });
        expect(otherMe.statusCode).toBe(200);
        const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
        expect(me.statusCode).toBe(401);

        const oldLogin = await post("/api/auth/login", { email, password: TEST_PASSWORD });
        const newLogin = await post("/api/auth/login", { email, password: NEW_PASSWORD });
        expect(oldLogin.statusCode).toBe(401);
        expect(newLogin.statusCode).toBe(200);

        const reuse = await post("/api/auth/password/reset", { token, newPassword: "yet another one" });
        expect(reuse.statusCode).toBe(400);
    });

    it("rejects an expired link", async () => {
        const { email } = await signUp(app);
        mailer.messages.length = 0;
        await post("/api/auth/password/forgot", { email });
        await mailArrived(1);
        await prisma.authToken.updateMany({
            where: { type: "PASSWORD_RESET" },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });

        const response = await post("/api/auth/password/reset", {
            token: mailer.tokenFor(email),
            newPassword: NEW_PASSWORD,
        });

        expect(response.statusCode).toBe(400);
    });

    // A verification link must never work as a password reset.
    it("rejects a token of the wrong type", async () => {
        const { email } = await signUp(app);
        const token = mailer.tokenFor(email);

        const response = await post("/api/auth/password/reset", { token, newPassword: NEW_PASSWORD });

        expect(response.statusCode).toBe(400);
        expect((await post("/api/auth/email/verify", { token })).statusCode).toBe(204);
    });

    it("retires older reset links when a new one is requested", async () => {
        const { email } = await signUp(app);
        mailer.messages.length = 0;
        await post("/api/auth/password/forgot", { email });
        await mailArrived(1);
        const first = mailer.tokenFor(email);
        await post("/api/auth/password/forgot", { email });
        await mailArrived(2);

        const response = await post("/api/auth/password/reset", { token: first, newPassword: NEW_PASSWORD });

        expect(response.statusCode).toBe(400);
    });
});

describe("when the mail provider is down", () => {
    it("still registers the user and signs them in", async () => {
        const failing: Mailer = {
            send: async () => {
                throw new Error("provider down");
            },
        };
        const broken = buildApp({ mailer: failing, rateLimits: false });
        await broken.ready();

        try {
            const { cookie } = await signUp(broken);
            const me = await broken.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });

            expect(me.statusCode).toBe(200);
        } finally {
            await broken.close();
        }
    });
});
