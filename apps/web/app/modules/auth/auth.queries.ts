import { queryOptions } from "@tanstack/react-query";

import { type Fetcher, nullOn, request } from "@/shared/api/request";
import { meKey } from "@/shared/query/query-client";
import type { Me } from "./session";

/** Null when signed out — a normal state, not an error. */
export const fetchMe = (fetcher: Fetcher) =>
    nullOn(401, async () => (await fetcher<{ user: Me }>("/api/auth/me")).user);

export const meQuery = (fetcher: Fetcher = request) =>
    queryOptions({ queryKey: meKey, queryFn: () => fetchMe(fetcher) });
