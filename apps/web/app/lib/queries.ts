import { queryOptions } from "@tanstack/react-query";

import { ApiError, type Fetcher, request } from "./api";
import type { EventRecord } from "./events";
import type { Me } from "./session";

/** The one definition of each cached resource — used by server prefetch and client useQuery alike. */
export const eventKeys = {
    all: ["events"] as const,
    detail: (id: string) => ["events", id] as const,
};

export const meKey = ["me"] as const;

const nullOn = async <T>(status: number, load: () => Promise<T>) => {
    try {
        return await load();
    } catch (error) {
        if (error instanceof ApiError && error.status === status) return null;
        throw error;
    }
};

/** Null when signed out — a normal state, not an error. */
export const fetchMe = (fetcher: Fetcher) =>
    nullOn(401, async () => (await fetcher<{ user: Me }>("/api/auth/me")).user);

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

export const meQuery = (fetcher: Fetcher = request) =>
    queryOptions({ queryKey: meKey, queryFn: () => fetchMe(fetcher) });
