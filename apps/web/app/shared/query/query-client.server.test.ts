import { dehydrate, queryOptions } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { makeQueryClient } from "./query-client";
import { getServerQueryClient, prefetch } from "./query-client.server";

describe("getServerQueryClient", () => {
    // A failed prefetch should render straight away (signed out, error page),
    // not after a retry delay.
    it("does not retry queries", () => {
        expect(getServerQueryClient().getDefaultOptions().queries?.retry).toBe(false);
    });
});

describe("prefetch", () => {
    it("caches the result for dehydrate, and a second call reuses it", async () => {
        const queryClient = makeQueryClient({ retry: false });
        const queryFn = vi.fn(async () => ["an event"]);
        const options = queryOptions({ queryKey: ["events"], queryFn });

        await prefetch(queryClient, options);
        await prefetch(queryClient, options);

        expect(queryFn).toHaveBeenCalledTimes(1);
        expect(dehydrate(queryClient).queries[0]?.state.data).toEqual(["an event"]);
    });

    // The page still renders; the client's useQuery shows the error.
    it("swallows a failed fetch", async () => {
        const queryClient = makeQueryClient({ retry: false });
        const options = queryOptions({
            queryKey: ["events"],
            queryFn: async (): Promise<string[]> => {
                throw new Error("API down");
            },
        });

        await expect(prefetch(queryClient, options)).resolves.toBeUndefined();
    });
});
