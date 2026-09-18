import { defineConfig, devices } from "@playwright/test";

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
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    // Reuses whatever is already running locally, and boots both apps in CI.
    // Postgres must be up first: `docker compose up -d`.
    webServer: [
        {
            command: "pnpm --filter api dev",
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
