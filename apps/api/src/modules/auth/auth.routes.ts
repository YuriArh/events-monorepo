import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { clearSessionCookie, setSessionCookie } from "../../lib/session-cookie.js";
import { requireAuth } from "../../plugins/session.js";
import { loginSchema, registerSchema } from "./auth.schema.js";
import { EmailTakenError, InvalidCredentialsError, authService } from "./auth.service.js";
import type { SessionMeta } from "./auth.types.js";

/** Domain errors carry no HTTP knowledge, so routes map them here. */
const replyForDomainError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof InvalidCredentialsError) {
    return reply.status(401).send({ message: error.message });
  }

  if (error instanceof EmailTakenError) {
    return reply.status(409).send({ message: error.message });
  }

  throw error;
};

const sessionMeta = (request: FastifyRequest): SessionMeta => ({
  userAgent: request.headers["user-agent"] ?? null,
  ip: request.ip,
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);

    try {
      const { user, session } = await authService.register(input, sessionMeta(request));
      setSessionCookie(reply, session.token, session.expiresAt);

      return reply.status(201).send({ user });
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);

    try {
      const { user, session } = await authService.login(input, sessionMeta(request));
      setSessionCookie(reply, session.token, session.expiresAt);

      return { user };
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/logout", async (request, reply) => {
    await authService.logout(request.sessionId);
    clearSessionCookie(reply);

    return reply.status(204).send();
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    return { user: request.user };
  });
};
