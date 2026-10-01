import type { FastifyPluginAsync } from "fastify";

import { requireAuth } from "../../plugins/session.js";
import { geocodeQuerySchema } from "./geocode.schema.js";
import { GeocodeUpstreamError, geocodeService } from "./geocode.service.js";

export const geocodeRoutes: FastifyPluginAsync = async (app) => {
  // Only the event form uses this, and it requires a session; anonymous
  // traffic would otherwise spend the shared Photon quota.
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    const { q, limit } = geocodeQuerySchema.parse(request.query);

    try {
      return await geocodeService.search(q, limit);
    } catch (error) {
      // The shared error handler only passes 4xx through, so 503 is mapped here.
      if (error instanceof GeocodeUpstreamError) {
        return reply.status(503).send({ message: error.message });
      }

      throw error;
    }
  });
};
