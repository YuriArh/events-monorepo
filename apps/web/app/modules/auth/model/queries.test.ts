import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/request";
import { fetchMe } from "./queries";

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
