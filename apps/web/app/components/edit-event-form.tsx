"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EventForm } from "@/components/event-form";
import { resolveImageKey, toEventInput, toFormValues, type EventFormValues } from "@/lib/event-form";
import { eventsApi, uploadImage } from "@/lib/events";
import { eventKeys, eventQueries } from "@/lib/queries";

export function EditEventForm({ id }: { id: string }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    // Hydrated by the page; the server has already checked it exists.
    const { data: event } = useQuery(eventQueries.detail(id));

    const updateEvent = useMutation({
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);

            return eventsApi.update(id, toEventInput(values, { imageKey }));
        },
        onSuccess: async () => {
            // eventKeys.all (["events"]) is a prefix of eventKeys.detail(id).
            await queryClient.invalidateQueries({ queryKey: eventKeys.all });
            router.push("/");
        },
    });

    if (!event) return null;

    return (
        <EventForm
            initialValues={toFormValues(event)}
            submitLabel="Save"
            onCancel={() => router.push("/")}
            onSubmit={async (values) => {
                await updateEvent.mutateAsync(values);
            }}
        />
    );
}
