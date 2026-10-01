import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import type { UserRole } from "@repo/db";

import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from "../lib/session-cookie.js";
import { authService } from "../modules/auth/auth.service.js";
import type { PublicUser } from "../modules/users/user.repository.js";

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
    sessionId: string | null;
  }
}

/**
 * Resolves the session cookie on every request. Wrapped in fastify-plugin so
 * the decorators and hook apply to every route module, not just this scope.
 * Requires @fastify/cookie to be registered first.
 */
export const sessionPlugin = fp(async (app) => {
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);

  app.addHook("onRequest", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;

    const resolved = await authService.resolveSession(token);

    if (!resolved) {
      clearSessionCookie(reply);
      return;
    }

    request.user = resolved.user;
    request.sessionId = resolved.sessionId;

    if (resolved.renewedExpiresAt) {
      setSessionCookie(reply, token, resolved.renewedExpiresAt);
    }
  });
});

/** 401: we don't know who you are. */
export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user) {
    return reply.status(401).send({ message: "Authentication required" });
  }
};

/** 401 when anonymous, 403 when signed in with the wrong role. */
export const requireRole =
  (role: UserRole) => async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "Authentication required" });
    }

    if (request.user.role !== role) {
      return reply.status(403).send({ message: "Forbidden" });
    }
  };

/** For handlers behind `requireAuth`; throwing here means a route forgot the guard. */
export const currentUser = (request: FastifyRequest) => {
  if (!request.user) {
    throw new Error("currentUser() used on a route without requireAuth");
  }

  return request.user;
};
