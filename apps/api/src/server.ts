import { buildApp } from "./app.js";

// RATE_LIMITS=off is for the e2e suite, which registers users on every run
// and would otherwise hit the 5-per-15-minutes sign-up limit. Never set it in
// production.
const app = buildApp({ rateLimits: process.env.RATE_LIMITS !== "off" });

const start = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT ?? 4000),
      host: "0.0.0.0",
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
