"use client";

import { useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";
import { meKey } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
    // Created in state rather than at module scope so a client is never shared
    // between requests when this renders on the server.
    const [queryClient] = useState(() => {
        /** Any 401 means the session is gone (expired, signed out elsewhere): reflect that everywhere. */
        const onError = (error: unknown) => {
            if (error instanceof ApiError && error.status === 401) {
                client.setQueryData(meKey, null);
            }
        };

        const client: QueryClient = new QueryClient({
            queryCache: new QueryCache({ onError }),
            mutationCache: new MutationCache({ onError }),
            defaultOptions: {
                queries: {
                    staleTime: 30_000,
                    // A 401 will not fix itself; do not retry it.
                    retry: (failureCount, error) =>
                        !(error instanceof ApiError && error.status === 401) && failureCount < 1,
                },
            },
        });

        return client;
    });

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
