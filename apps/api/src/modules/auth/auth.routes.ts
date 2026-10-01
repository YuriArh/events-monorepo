import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { type AuthRateLimitName, rateLimitOption } from "../../lib/rate-limits.js";
import { clearSessionCookie, setSessionCookie } from "../../lib/session-cookie.js";
import { currentUser, requireAuth } from "../../plugins/session.js";
import {
  changePasswordSchema,
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
import { WrongPasswordError, userService } from "../users/user.service.js";

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

  if (error instanceof WrongPasswordError) {
    return reply.status(400).send({ message: error.message });
  }

  throw error;
};

/** Only the error's name is logged: messages from providers may echo addresses or links. */
const errorName = (error: unknown) => (error instanceof Error ? error.name : "unknown");

const sessionMeta = (request: FastifyRequest): SessionMeta => ({
  userAgent: request.headers["user-agent"] ?? null,
  ip: request.ip,
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const limited = (name: AuthRateLimitName) => rateLimitOption(app, name);

  app.post("/register", limited("register"), async (request, reply) => {
    const input = registerSchema.parse(request.body);

    try {
      const { user, session, mailError } = await authService.register(
        input,
        sessionMeta(request),
        app.mailer,
      );

      if (mailError) request.log.error({ err: errorName(mailError) }, "verification mail failed");
      setSessionCookie(reply, session.token, session.expiresAt);

      return reply.status(201).send({ user });
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/login", limited("login"), async (request, reply) => {
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

  app.post("/logout-all", { preHandler: requireAuth }, async (request, reply) => {
    await authService.logoutAll(currentUser(request).id);
    clearSessionCookie(reply);

    return reply.status(204).send();
  });

  app.post("/password/change", { preHandler: requireAuth, ...limited("changePassword") }, async (request, reply) => {
    const input = changePasswordSchema.parse(request.body);

    try {
      // sessionId is set whenever request.user is, which requireAuth guarantees.
      await userService.changePassword(currentUser(request).id, request.sessionId as string, input);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    return { user: request.user };
  });

  // Tokens travel in the body, so they never land in API access logs.
  app.post("/password/forgot", limited("forgotPassword"), async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body);

    // Neither awaited nor allowed to fail the request: timing and errors must not
    // reveal whether the account exists, so the answer is always an immediate 204.
    void authService
      .requestPasswordReset(email, app.mailer)
      .catch((error: unknown) => request.log.error({ err: errorName(error) }, "password reset mail failed"));

    return reply.status(204).send();
  });

  app.post("/password/reset", limited("resetPassword"), async (request, reply) => {
    const { token, newPassword } = resetPasswordSchema.parse(request.body);

    try {
      await authService.resetPassword(token, newPassword);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/email/verify", limited("verifyEmail"), async (request, reply) => {
    const { token } = verifyEmailSchema.parse(request.body);

    try {
      await authService.verifyEmail(token);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/email/resend", { preHandler: requireAuth, ...limited("resendVerification") }, async (request, reply) => {
    await authService.resendVerification(currentUser(request), app.mailer);

    return reply.status(204).send();
  });
};
