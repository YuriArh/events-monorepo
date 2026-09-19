import type { FastifyPluginAsync, FastifyReply } from "fastify";

import {
  addressParamsSchema,
  createAddressSchema,
  updateAddressSchema,
} from "./address.schema.js";
import { AddressNotFoundError, addressService } from "./address.service.js";

const replyForDomainError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof AddressNotFoundError) {
    return reply.status(404).send({ message: error.message });
  }

  throw error;
};

export const addressRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return addressService.list();
  });

  app.get("/:id", async (request, reply) => {
    const { id } = addressParamsSchema.parse(request.params);

    try {
      return await addressService.getById(id);
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/", async (request, reply) => {
    const input = createAddressSchema.parse(request.body);

    return reply.status(201).send(await addressService.create(input));
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = addressParamsSchema.parse(request.params);
    const input = updateAddressSchema.parse(request.body);

    try {
      return await addressService.update(id, input);
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = addressParamsSchema.parse(request.params);

    try {
      await addressService.remove(id);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });
};
