import { cache } from "react";

import { ApiError, request } from "./api";
import type { EventRecord } from "./events";

/**
 * Server-side read of a public event. `cache` makes the page and
 * generateMetadata share one request per render. Not cached across requests —
 * edits must show immediately.
 */
export const getEvent = cache(async (id: string) => {
    try {
        return await request<EventRecord>(`/api/events/${encodeURIComponent(id)}`, { cache: "no-store" });
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
    }
});
