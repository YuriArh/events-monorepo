import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import type { FastifyPluginAsync, FastifyReply } from "fastify";

import {
  buildImageKey,
  deleteUpload,
  ensureUploadsDir,
  MAX_UPLOAD_BYTES,
  resolveUploadPath,
  UnsupportedImageTypeError,
} from "../../lib/uploads.js";
import {
  createEventSchema,
  eventParamsSchema,
  updateEventSchema,
} from "./event.schema.js";
import {
  AddressAlreadyLinkedError,
  EventNotFoundError,
  InvalidEventDateRangeError,
  UnknownAddressError,
  eventService,
} from "./event.service.js";

/** Domain errors carry no HTTP knowledge, so routes map them here. */
const replyForDomainError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof EventNotFoundError) {
    return reply.status(404).send({ message: error.message });
  }

  if (
    error instanceof UnknownAddressError ||
    error instanceof AddressAlreadyLinkedError ||
    error instanceof InvalidEventDateRangeError
  ) {
    return reply.status(400).send({ message: error.message });
  }

  throw error;
};

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return eventService.list();
  });

  app.get("/:id", async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);

    try {
      return await eventService.getById(id);
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.post("/", async (request, reply) => {
    const input = createEventSchema.parse(request.body);

    try {
      return reply.status(201).send(await eventService.create(input));
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);
    const input = updateEventSchema.parse(request.body);

    try {
      return await eventService.update(id, input);
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);

    try {
      await eventService.remove(id);

      return reply.status(204).send();
    } catch (error) {
      return replyForDomainError(error, reply);
    }
  });

  // Uploads are their own endpoint so creating an event stays a plain JSON
  // request; the client uploads first and submits the returned key.
  app.post("/upload", async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });

    if (!file) {
      return reply.status(400).send({ message: "No file uploaded" });
    }

    let imageKey: string;

    try {
      imageKey = buildImageKey(file.mimetype);
    } catch (error) {
      if (error instanceof UnsupportedImageTypeError) {
        return reply.status(415).send({ message: error.message });
      }

      throw error;
    }

    await ensureUploadsDir();
    await pipeline(file.file, createWriteStream(resolveUploadPath(imageKey)));

    // The stream stops at the limit rather than throwing, so check afterwards
    // and clean up the partial file.
    if (file.file.truncated) {
      await deleteUpload(imageKey);

      return reply.status(413).send({ message: "Image exceeds the 5MB limit" });
    }

    return reply.status(201).send({ imageKey });
  });
};
