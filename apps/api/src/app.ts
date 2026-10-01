import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { ZodError } from "@repo/contracts";

import { ConsoleMailer, type Mailer } from "./lib/mailer.js";
import { MAX_UPLOAD_BYTES, UPLOADS_DIR } from "./lib/uploads.js";
import { WEB_ORIGIN } from "./lib/config.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { sessionPlugin } from "./plugins/session.js";
import { eventRoutes } from "./modules/events/event.routes.js";
import { geocodeRoutes } from "./modules/geocoding/geocode.routes.js";

declare module "fastify" {
  interface FastifyInstance {
    mailer: Mailer;
  }
}

export type BuildAppOptions = {
  /** Tests pass a MemoryMailer; development logs mail to the console. */
  mailer?: Mailer;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  app.decorate("mailer", options.mailer ?? new ConsoleMailer((line) => app.log.info(line)));

  app.register(cors, {
    origin: WEB_ORIGIN,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    // The session cookie only travels on credentialed requests.
    credentials: true,
  });

  app.register(cookie);
  app.register(sessionPlugin);

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

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(eventRoutes, { prefix: "/api/events" });
  app.register(geocodeRoutes, { prefix: "/api/geocode" });

  return app;
}
