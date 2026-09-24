import type { FastifyPluginAsync } from "fastify";

import { geocodeQuerySchema } from "./geocode.schema.js";
import { GeocodeUpstreamError, geocodeService } from "./geocode.service.js";

export const geocodeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
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
