"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EventForm } from "@/components/event-form";
import { Spinner } from "@/components/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { canModifyEvent, useRequireUser } from "@/lib/auth";
import { resolveImageKey, toEventInput, toFormValues, type EventFormValues } from "@/lib/event-form";
import { eventKeys, eventsApi, uploadImage } from "@/lib/events";
import { colors, typography } from "@/styles/tokens.stylex";

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
});

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { me, ready } = useRequireUser();
    const queryClient = useQueryClient();

    const { data: event, isPending, error } = useQuery({
        queryKey: eventKeys.detail(id),
        queryFn: () => eventsApi.get(id),
        enabled: ready,
    });

    const updateEvent = useMutation({
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);

            return eventsApi.update(id, toEventInput(values, { imageKey }));
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
                        {!ready || isPending ? (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                <Spinner size={16} />
                                Loading…
                            </div>
                        ) : error || !event ? (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                {error instanceof Error ? error.message : "Event not found"}
                            </div>
                        ) : !canModifyEvent(me, event) ? (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                Only the organizer can edit this event.
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
