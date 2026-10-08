import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import { fetchEvent, fetchMe } from "./queries";

describe("fetchMe", () => {
    it("returns the user", async () => {
        const fetcher = vi.fn().mockResolvedValue({ user: { id: "u1" } });
        await expect(fetchMe(fetcher)).resolves.toEqual({ id: "u1" });
        expect(fetcher).toHaveBeenCalledWith("/api/auth/me");
    });

    it("is null when signed out", async () => {
        const fetcher = vi.fn().mockRejectedValue(new ApiError("Authentication required", 401));
        await expect(fetchMe(fetcher)).resolves.toBeNull();
    });

    it("rethrows other failures", async () => {
        const fetcher = vi.fn().mockRejectedValue(new ApiError("boom", 500));
        await expect(fetchMe(fetcher)).rejects.toThrow("boom");
    });
});

describe("fetchEvent", () => {
    it("is null for an unknown event", async () => {
        const fetcher = vi.fn().mockRejectedValue(new ApiError("not found", 404));
        await expect(fetchEvent("missing", fetcher)).resolves.toBeNull();
    });

    // URL normalisation would turn these into the list / root endpoints.
    it.each([".", ".."])("is null for %s without calling the API", async (id) => {
        const fetcher = vi.fn();
        await expect(fetchEvent(id, fetcher)).resolves.toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("encodes the id", async () => {
        const fetcher = vi.fn().mockResolvedValue({ id: "a b" });
        await fetchEvent("a b", fetcher);
        expect(fetcher).toHaveBeenCalledWith("/api/events/a%20b");
    });
});
