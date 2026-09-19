import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";

import { MAX_UPLOAD_BYTES, UPLOADS_DIR } from "./lib/uploads.js";
import { addressRoutes } from "./modules/addresses/address.routes.js";
import { eventRoutes } from "./modules/events/event.routes.js";

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  app.register(cors, {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });

  app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  // Serves the files written by POST /api/events/upload.
  app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: "/uploads/",
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Validation error",
        issues: error.issues,
      });
    }

    if (error instanceof Error) {
      const statusCode = Number(Reflect.get(error, "statusCode"));

      if (statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send({ message: error.message });
      }
    }

    app.log.error(error);
    return reply.status(500).send({ message: "Internal server error" });
  });

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.register(eventRoutes, { prefix: "/api/events" });
  app.register(addressRoutes, { prefix: "/api/addresses" });

  return app;
}
