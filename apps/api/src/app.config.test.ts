import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryMailer } from "./lib/mailer.js";

/**
 * buildApp must fail closed: only an explicit development or test NODE_ENV
 * may fall back to the console mailer. A fresh module graph per case, so
 * nothing read from the environment at import time leaks between them.
 */
const loadBuildApp = async () => {
    vi.resetModules();
    const { buildApp } = await import("./app.js");
    return buildApp;
};

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("buildApp mailer configuration", () => {
    it.each([
        ["unset", undefined],
        ["production", "production"],
        ["staging", "staging"],
    ])("refuses to start without a mailer when NODE_ENV is %s", async (_label, nodeEnv) => {
        vi.stubEnv("NODE_ENV", nodeEnv);
        const buildApp = await loadBuildApp();

        expect(() => buildApp()).toThrow(/A real Mailer must be configured/);
    });

    it.each([["unset", undefined], ["production", "production"]])(
        "starts with an injected mailer when NODE_ENV is %s",
        async (_label, nodeEnv) => {
            vi.stubEnv("NODE_ENV", nodeEnv);
            const buildApp = await loadBuildApp();

            const app = buildApp({ mailer: new MemoryMailer() });
            await app.close();
        },
    );

    it.each(["development", "test"])("falls back to the console mailer when NODE_ENV is %s", async (nodeEnv) => {
        vi.stubEnv("NODE_ENV", nodeEnv);
        const buildApp = await loadBuildApp();

        const app = buildApp();
        await app.close();
    });
});

describe("COOKIE_SECURE", () => {
    it.each([
        ["https://app.example.com", true],
        ["http://localhost:3000", false],
    ])("follows the protocol of WEB_ORIGIN %s, whatever NODE_ENV says", async (origin, secure) => {
        vi.stubEnv("NODE_ENV", undefined);
        vi.stubEnv("WEB_ORIGIN", origin);
        vi.resetModules();

        const { COOKIE_SECURE } = await import("./lib/config.js");

        expect(COOKIE_SECURE).toBe(secure);
    });
});
