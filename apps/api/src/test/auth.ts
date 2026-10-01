import type { FastifyInstance, LightMyRequestResponse } from "fastify";

import { prisma } from "@repo/db";

export const TEST_PASSWORD = "correct horse battery";

let counter = 0;

/** The `sid=…` pair from a response's Set-Cookie, ready for a `cookie` header. */
export const sessionCookieFrom = (response: LightMyRequestResponse) => {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const sid = cookies.find((cookie) => cookie.startsWith("sid="));

  if (!sid) {
    throw new Error(`No session cookie in response (status ${response.statusCode})`);
  }

  return sid.split(";")[0] as string;
};

/** Registers a fresh user through the real endpoint and returns its session cookie. */
export const signUp = async (app: FastifyInstance, overrides: { email?: string; password?: string; name?: string } = {}) => {
  counter += 1;
  const payload = {
    email: `user${counter}-${Date.now()}@example.test`,
    password: TEST_PASSWORD,
    ...overrides,
  };

  const response = await app.inject({ method: "POST", url: "/api/auth/register", payload });

  if (response.statusCode !== 201) {
    throw new Error(`signUp failed: ${response.statusCode} ${response.body}`);
  }

  return {
    user: response.json<{ user: { id: string; email: string } }>().user,
    cookie: sessionCookieFrom(response),
    email: payload.email.toLowerCase(),
    password: payload.password,
  };
};

export const makeAdmin = (userId: string) =>
  prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
