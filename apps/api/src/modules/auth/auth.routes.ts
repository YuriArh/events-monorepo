import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { clearSessionCookie, setSessionCookie } from "../../lib/session-cookie.js";
import { currentUser, requireAuth } from "../../plugins/session.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.schema.js";
import {
  EmailTakenError,
  InvalidCredentialsError,
  InvalidTokenError,
  authService,
} from "./auth.service.js";
import type { SessionMeta } from "./auth.types.js";

/** Domain errors carry no HTTP knowledge, so routes map them here. */
const replyForDomainError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof InvalidCredentialsError) {
    return reply.status(401).send({ message: error.message });
  }

  if (error instanceof EmailTakenError) {
    return reply.status(409).send({ message: error.message });
  }

  if (error instanceof InvalidTokenError) {
    return reply.status(400).send({ message: error.message });
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
      const { user, session } = await authService.register(input, sessionMeta(request), app.mailer);
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

  // Tokens travel in the body, so they never land in API access logs.
  app.post("/password/forgot", async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body);

    await authService.requestPasswordReset(email, app.mailer);

    // Always 204, so this endpoint can't be used to find out who has an account.
    return reply.status(204).send();
  });

  app.post("/password/reset", async (request, reply) => {
    const { token, newPassword } = resetPasswordSchema.parse(request.body);

    try {
      await authService.resetPassword(token, newPassword);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/email/verify", async (request, reply) => {
    const { token } = verifyEmailSchema.parse(request.body);

    try {
      await authService.verifyEmail(token);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/email/resend", { preHandler: requireAuth }, async (request, reply) => {
    await authService.resendVerification(currentUser(request), app.mailer);

    return reply.status(204).send();
  });
};
