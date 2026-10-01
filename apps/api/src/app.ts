import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { ZodError } from "@repo/contracts";

import { ConsoleMailer, type Mailer } from "./lib/mailer.js";
import { MAX_UPLOAD_BYTES, UPLOADS_DIR } from "./lib/uploads.js";
import { IS_PRODUCTION, WEB_ORIGIN } from "./lib/config.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { sessionPlugin } from "./plugins/session.js";
import { eventRoutes } from "./modules/events/event.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { geocodeRoutes } from "./modules/geocoding/geocode.routes.js";

declare module "fastify" {
  interface FastifyInstance {
    mailer: Mailer;
    rateLimitsEnabled: boolean;
  }
}

export type BuildAppOptions = {
  /** Tests pass a MemoryMailer; development logs mail to the console. */
  mailer?: Mailer;
  /** On by default; tests turn it off so signing up many users doesn't trip it. */
  rateLimits?: boolean;
};

const STATE_CHANGING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function buildApp(options: BuildAppOptions = {}) {
  if (IS_PRODUCTION && !options.mailer) {
    throw new Error("A real Mailer must be configured in production");
  }

  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  app.decorate("mailer", options.mailer ?? new ConsoleMailer((line) => app.log.info(line)));

  app.decorate("rateLimitsEnabled", options.rateLimits ?? true);

  // Only routes that opt in are limited. preHandler (not the default
  // onRequest) so key generators can read the parsed body and request.user.
  app.register(rateLimit, { global: false, hook: "preHandler" });

  /**
   * CSRF defence in depth. SameSite=Lax already keeps the cookie off
   * cross-site writes, but treats sibling subdomains as same-site. Browsers
   * always send Origin on these methods; requests without one (curl, tests)
   * are not a CSRF vector.
   */
  app.addHook("onRequest", async (request, reply) => {
    if (!STATE_CHANGING.has(request.method)) return;

    const origin = request.headers.origin;

    if (origin !== undefined && origin !== WEB_ORIGIN) {
      return reply.status(403).send({ message: "Cross-origin request blocked" });
    }
  });

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
  app.register(userRoutes, { prefix: "/api/users" });

  return app;
}
