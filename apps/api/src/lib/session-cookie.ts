import type { FastifyReply } from "fastify";

import { COOKIE_SECURE } from "./config.js";

export const SESSION_COOKIE = "sid";

/**
 * HttpOnly: page scripts can't read it, so XSS can't steal it.
 * SameSite=Lax: not sent on cross-site POST/PATCH/DELETE.
 * Secure whenever WEB_ORIGIN is https: the dev servers are plain HTTP.
 * Not signed: the token is unguessable and the server looks it up anyway.
 */
export const setSessionCookie = (reply: FastifyReply, token: string, expiresAt: Date) =>
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    expires: expiresAt,
  });

export const clearSessionCookie = (reply: FastifyReply) =>
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
