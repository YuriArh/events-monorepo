import { cache } from "react";
import type { QueryClient, QueryExecuteOptions, QueryKey } from "@tanstack/react-query";

import { makeQueryClient } from "./query-client";

/** One client per request, shared by the layout, the page and generateMetadata. No retries: render now. */
export const getServerQueryClient = cache(() => makeQueryClient({ retry: false }));

/**
 * Fills the cache for `dehydrate` without throwing: a failed fetch leaves the
 * page to render and the client's `useQuery` to show the error. Within
 * `staleTime` a second call reuses the cached result.
 */
export const prefetch = async <TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
    queryClient: QueryClient,
    options: QueryExecuteOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
) => {
    await queryClient.query(options).catch(() => undefined);
};
