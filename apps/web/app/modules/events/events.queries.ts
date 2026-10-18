import { queryOptions } from "@tanstack/react-query";

import { type Fetcher, nullOn, request } from "@/shared/api/request";
import type { EventRecord } from "./events.api";

/** The one definition of each cached resource — used by server prefetch and client useQuery alike. */
export const eventKeys = {
    all: ["events"] as const,
    detail: (id: string) => ["events", id] as const,
};

/** Null for unknown ids; "." / ".." would normalise to other endpoints. */
export const fetchEvent = async (id: string, fetcher: Fetcher) => {
    if (id === "." || id === "..") return null;
    return nullOn(404, () => fetcher<EventRecord>(`/api/events/${encodeURIComponent(id)}`));
};

export const eventQueries = {
    list: (fetcher: Fetcher = request) =>
        queryOptions({ queryKey: eventKeys.all, queryFn: () => fetcher<EventRecord[]>("/api/events") }),
    detail: (id: string, fetcher: Fetcher = request) =>
        queryOptions({ queryKey: eventKeys.detail(id), queryFn: () => fetchEvent(id, fetcher) }),
};
