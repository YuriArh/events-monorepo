import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { afterEach, describe, expect, it } from "vitest";

import { limit } from "./rate-limits.js";

/** A bare app with one route behind the given limit; no database, so floods are cheap. */
let app: FastifyInstance;

const build = async (max: number) => {
    app = Fastify();
    await app.register(rateLimit, { global: false, hook: "preHandler" });
    const key = (request: FastifyRequest) => (request.body as Record<string, string>).k ?? "";
    app.post("/", { config: { rateLimit: limit(max, key) } }, async () => "ok");
    await app.ready();
};

const hit = (k: string) =>
    app.inject({ method: "POST", url: "/", payload: { k } }).then((response) => response.statusCode);

afterEach(async () => {
    await app.close();
});

describe("limit", () => {
    it("answers 429 once a key is over its limit, and only for that key", async () => {
        await build(2);

        expect([await hit("a"), await hit("a"), await hit("a")]).toEqual([200, 200, 429]);
        expect(await hit("b")).toBe(200);
    });

    // The plugin's default store forgets the oldest of 5000 keys, which would
    // let a flood of throwaway keys reset a victim's counter.
    it("keeps a blocked key blocked after a flood of other keys", async () => {
        await build(2);

        await hit("victim");
        await hit("victim");
        for (let i = 0; i < 6000; i += 1) await hit(`junk${i}`);

        expect(await hit("victim")).toBe(429);
    });
});
