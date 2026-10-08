import { redirect } from "next/navigation";
import * as stylex from "@stylexjs/stylex";

import { Card, CardContent } from "@/components/card";
import { NewEventForm } from "@/components/new-event-form";
import { getMe } from "@/lib/session.server";
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

export default async function NewEventPage() {
    if (!(await getMe())) redirect(`/login?next=${encodeURIComponent("/events/new")}`);

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <h1 {...stylex.props(styles.title)}>New event</h1>
                </div>

                <Card>
                    <CardContent>
                        <NewEventForm />
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
