import { MutationCache, QueryCache, QueryClient, environmentManager } from "@tanstack/react-query";

import { ApiError } from "./api";
import { meKey } from "./queries";

/** `retry: false` for the server, where a failed prefetch should render at once rather than after a delay. */
export const makeQueryClient = ({ retry = true }: { retry?: boolean } = {}) => {
    /** Any 401 means the session is gone (expired, signed out elsewhere): reflect that everywhere. */
    const onError = (error: unknown) => {
        if (error instanceof ApiError && error.status === 401) client.setQueryData(meKey, null);
    };

    const client: QueryClient = new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
            queries: {
                // Above zero, so data hydrated from the server isn't refetched on mount.
                staleTime: 60_000,
                // A 401 will not fix itself; do not retry it.
                retry: retry
                    ? (failureCount, error) => !(error instanceof ApiError && error.status === 401) && failureCount < 1
                    : false,
            },
        },
    });

    return client;
};

let browserClient: QueryClient | undefined;

/** SSR of client components: a fresh client per render. Browser: one client for the session. */
export const getQueryClient = () => {
    // The `isServer` constant is deprecated in this TanStack version.
    if (environmentManager.isServer()) return makeQueryClient();
    browserClient ??= makeQueryClient();
    return browserClient;
};
