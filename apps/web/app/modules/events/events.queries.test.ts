import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/request";
import { fetchEvent } from "./events.queries";

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
