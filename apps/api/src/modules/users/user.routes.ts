import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { rateLimitOption } from "../../lib/rate-limits.js";
import { clearSessionCookie } from "../../lib/session-cookie.js";
import { currentUser, requireAuth } from "../../plugins/session.js";
import { deleteAccountSchema, updateProfileSchema } from "./user.schema.js";
import { WrongPasswordError, userService } from "./user.service.js";

const replyForDomainError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof WrongPasswordError) {
    return reply.status(400).send({ message: error.message });
  }

  throw error;
};

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.patch("/me", async (request) => {
    const input = updateProfileSchema.parse(request.body);

    return { user: await userService.updateProfile(currentUser(request).id, input) };
  });

  app.delete("/me", rateLimitOption(app, "deleteAccount"), async (request, reply) => {
    const { password } = deleteAccountSchema.parse(request.body);

    try {
      await userService.deleteAccount(currentUser(request).id, password);
      clearSessionCookie(reply);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });
};
