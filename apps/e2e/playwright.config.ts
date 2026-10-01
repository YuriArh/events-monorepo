import { defineConfig, devices } from "@playwright/test";

import { STORAGE_STATE } from "./tests/support/auth.js";

const WEB_URL = "http://localhost:3000";
const API_URL = "http://localhost:4000";

export default defineConfig({
    testDir: "./tests",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: WEB_URL,
        trace: "on-first-retry",
    },
    projects: [
        { name: "setup", testMatch: /auth\.setup\.ts/, teardown: "teardown" },
        { name: "teardown", testMatch: /auth\.teardown\.ts/ },
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
            dependencies: ["setup"],
        },
    ],
    // Reuses whatever is already running locally, and boots both apps in CI.
    // Postgres must be up first: `docker compose up -d`.
    // A dev API you already have running is reused as-is; start it with
    // RATE_LIMITS=off too, or repeated runs hit the sign-up limit.
    webServer: [
        {
            command: "RATE_LIMITS=off pnpm --filter api dev",
            url: `${API_URL}/health`,
            reuseExistingServer: !process.env.CI,
            cwd: "../..",
            timeout: 60_000,
        },
        {
            command: "pnpm --filter web dev",
            url: WEB_URL,
            reuseExistingServer: !process.env.CI,
            cwd: "../..",
            timeout: 120_000,
        },
    ],
});
