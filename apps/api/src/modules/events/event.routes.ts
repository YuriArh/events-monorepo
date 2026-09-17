import type { FastifyPluginAsync } from "fastify";

import {
  createEventSchema,
  eventParamsSchema,
  updateEventSchema,
} from "./event.schema.js";
import { EventNotFoundError, eventService } from "./event.service.js";

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return eventService.list();
  });

  app.get("/:id", async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);

    try {
      return await eventService.getById(id);
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });

  app.post("/", async (request, reply) => {
    const input = createEventSchema.parse(request.body);
    const event = await eventService.create(input);

    return reply.status(201).send(event);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);
    const input = updateEventSchema.parse(request.body);

    try {
      return await eventService.update(id, input);
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);

    try {
      await eventService.remove(id);

      return reply.status(204).send();
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });
};
