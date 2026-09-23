"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";

import { EventForm } from "@/components/event-form";
import { Card, CardContent } from "@/components/ui/card";
import {
    resolveAddressId,
    resolveImageKey,
    toEventInput,
    toFormValues,
    type EventFormValues,
} from "@/lib/event-form";
import { addressesApi, eventKeys, eventsApi, uploadImage } from "@/lib/events";
import { colors, typography } from "@/styles/tokens.stylex";

const spin = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });

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
    state: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        paddingBlock: "5rem",
        color: colors.mutedForeground,
    },
    spinner: {
        animationName: spin,
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
});

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: event, isPending, error } = useQuery({
        queryKey: eventKeys.detail(id),
        queryFn: () => eventsApi.get(id),
    });

    const updateEvent = useMutation({
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);
            const addressId = await resolveAddressId(values, event?.addressId ?? null, addressesApi);
            const input = toEventInput(values, { imageKey, addressId });

            return eventsApi.update(id, input);
        },
        onSuccess: async () => {
            // eventKeys.all (["events"]) is a prefix of eventKeys.detail(id)
            // (["events", id]), so invalidating "all" already invalidates this
            // detail query too.
            await queryClient.invalidateQueries({ queryKey: eventKeys.all });
            router.push("/");
        },
    });

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <h1 {...stylex.props(styles.title)}>Edit event</h1>
                </div>

                <Card>
                    <CardContent>
                        {isPending ? (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                <Loader2Icon {...stylex.props(styles.spinner)} size={16} />
                                Loading…
                            </div>
                        ) : error || !event ? (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                {error instanceof Error ? error.message : "Event not found"}
                            </div>
                        ) : (
                            <EventForm
                                initialValues={toFormValues(event)}
                                submitLabel="Save"
                                onCancel={() => router.push("/")}
                                onSubmit={async (values) => {
                                    await updateEvent.mutateAsync(values);
                                }}
                            />
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
