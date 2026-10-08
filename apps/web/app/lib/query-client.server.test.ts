import { describe, expect, it } from "vitest";

import { getServerQueryClient } from "./query-client.server";

describe("getServerQueryClient", () => {
    // A failed prefetch should render straight away (signed out, error page),
    // not after a retry delay.
    it("does not retry queries", () => {
        expect(getServerQueryClient().getDefaultOptions().queries?.retry).toBe(false);
    });
});
