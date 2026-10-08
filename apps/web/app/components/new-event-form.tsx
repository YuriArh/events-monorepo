"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { EventForm } from "@/components/event-form";
import { emptyFormValues, resolveImageKey, toEventInput, type EventFormValues } from "@/lib/event-form";
import { eventsApi, uploadImage } from "@/lib/events";
import { eventKeys } from "@/lib/queries";

export function NewEventForm() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const createEvent = useMutation({
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);

            return eventsApi.create(toEventInput(values, { imageKey }));
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: eventKeys.all });
            router.push("/");
        },
    });

    return (
        <EventForm
            initialValues={emptyFormValues()}
            submitLabel="Create"
            onCancel={() => router.push("/")}
            onSubmit={async (values) => {
                await createEvent.mutateAsync(values);
            }}
        />
    );
}
