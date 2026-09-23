"use client";

import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { EventForm } from "@/components/event-form";
import { Card, CardContent } from "@/components/ui/card";
import {
    emptyFormValues,
    resolveAddressId,
    resolveImageKey,
    toEventInput,
    type EventFormValues,
} from "@/lib/event-form";
import { addressesApi, eventKeys, eventsApi, uploadImage } from "@/lib/events";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: { default: "1rem", "@media (min-width: 640px)": "1.5rem" },
        paddingBlock: "3.5rem",
    },
    title: { fontSize: "1.875rem", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.025em" },
    header: { marginBottom: "1.75rem" },
});

export default function NewEventPage() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const createEvent = useMutation({
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);
            const addressId = await resolveAddressId(values, null, addressesApi);
            const input = toEventInput(values, { imageKey, addressId });

            return eventsApi.create(input);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: eventKeys.all });
            router.push("/");
        },
    });

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <h1 {...stylex.props(styles.title)}>New event</h1>
                </div>

                <Card>
                    <CardContent>
                        <EventForm
                            initialValues={emptyFormValues()}
                            submitLabel="Create"
                            onCancel={() => router.push("/")}
                            onSubmit={async (values) => {
                                await createEvent.mutateAsync(values);
                            }}
                        />
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
