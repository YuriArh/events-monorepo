import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    // Runs automatically after `migrate reset`, which is what makes a reset
    // cheap enough to reach for.
    seed: "tsx prisma/seed.ts",
  },
});
