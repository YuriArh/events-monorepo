import { notFound, redirect } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/card";
import { EditEventForm } from "@/components/edit-event-form";
import { serverRequest } from "@/lib/api.server";
import { eventQueries } from "@/lib/queries";
import { getServerQueryClient } from "@/lib/query-client.server";
import { canModifyEvent } from "@/lib/session";
import { getMe } from "@/lib/session.server";
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
        paddingBlock: "5rem",
        color: colors.mutedForeground,
    },
});

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const me = await getMe();
    if (!me) redirect(`/login?next=${encodeURIComponent(`/events/${id}/edit`)}`);

    const queryClient = getServerQueryClient();
    const event = await queryClient.query(eventQueries.detail(id, serverRequest));
    if (!event) notFound();

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <h1 {...stylex.props(styles.title)}>Edit event</h1>
                </div>

                <Card>
                    <CardContent>
                        {canModifyEvent(me, event) ? (
                            <HydrationBoundary state={dehydrate(queryClient)}>
                                <EditEventForm id={id} />
                            </HydrationBoundary>
                        ) : (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                Only the organizer or an admin can edit this event.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
