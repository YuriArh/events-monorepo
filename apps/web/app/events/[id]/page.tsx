import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { EventDetail } from "@/components/event-detail";
import { serverRequest } from "@/lib/api.server";
import { imageUrl } from "@/lib/events";
import { eventQueries } from "@/lib/queries";
import { getServerQueryClient } from "@/lib/query-client.server";

type Props = { params: Promise<{ id: string }> };

const DESCRIPTION_LIMIT = 160;

const loadEvent = (id: string) => getServerQueryClient().query(eventQueries.detail(id, serverRequest));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const event = await loadEvent((await params).id);
    if (!event) notFound();

    return {
        title: event.name,
        description: event.description?.slice(0, DESCRIPTION_LIMIT) || undefined,
        openGraph: event.imageKey ? { images: [imageUrl(event.imageKey)] } : undefined,
    };
}

export default async function EventPage({ params }: Props) {
    const { id } = await params;
    // Awaited before anything streams, so the status is a real 404.
    if (!(await loadEvent(id))) notFound();

    return (
        <HydrationBoundary state={dehydrate(getServerQueryClient())}>
            <EventDetail id={id} />
        </HydrationBoundary>
    );
}
