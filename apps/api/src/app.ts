import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";

import { eventRoutes } from "./modules/events/event.routes.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE"],
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

  return app;
}
