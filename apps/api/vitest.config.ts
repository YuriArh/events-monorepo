import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        setupFiles: ["./vitest.setup.ts"],
        // Integration tests share one database, so they must not run concurrently.
        fileParallelism: false,
        env: {
            // Set here rather than in a setup file: @repo/db builds its connection
            // pool at import time, which happens before setup files run.
            DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/eventapp_test",
        },
    },
});
