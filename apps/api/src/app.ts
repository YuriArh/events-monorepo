import Fastify from "fastify";
import cors from "@fastify/cors";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: "http://localhost:3000",
  });

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.get("/api/events", async () => {
    return {
      events: [],
    };
  });

  return app;
}
