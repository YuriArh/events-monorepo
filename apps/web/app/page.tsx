import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { EventList } from "@/modules/events/components/event-list";
import { serverRequest } from "@/shared/api/request.server";
import { eventQueries } from "@/modules/events/events.queries";
import { getServerQueryClient, prefetch } from "@/shared/query/query-client.server";

export default async function HomePage() {
    const queryClient = getServerQueryClient();
    await prefetch(queryClient, eventQueries.list(serverRequest));

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <EventList />
        </HydrationBoundary>
    );
}
