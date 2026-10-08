import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { EventList } from "@/components/event-list";
import { serverRequest } from "@/lib/api.server";
import { eventQueries } from "@/lib/queries";
import { getServerQueryClient } from "@/lib/query-client.server";

export default async function HomePage() {
    const queryClient = getServerQueryClient();
    await queryClient.prefetchQuery(eventQueries.list(serverRequest));

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <EventList />
        </HydrationBoundary>
    );
}
