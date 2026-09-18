"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
    // Created in state rather than at module scope so a client is never shared
    // between requests when this renders on the server.
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 30_000,
                        retry: 1,
                    },
                },
            }),
    );

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
