import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./app", import.meta.url)),
        },
    },
    test: {
        environment: "node",
        include: ["app/**/*.test.ts"],
        env: {
            NEXT_PUBLIC_API_URL: "http://api.test",
        },
    },
});
