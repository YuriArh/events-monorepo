import Link from "next/link";
import * as stylex from "@stylexjs/stylex";

import { colors, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: "1rem",
        paddingBlock: "3.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
    },
    title: { fontSize: "1.875rem", fontWeight: 600 },
    text: { color: colors.mutedForeground },
});

export default function EventNotFound() {
    return (
        <main {...stylex.props(styles.main)}>
            <title>Event not found</title>
            <h1 {...stylex.props(styles.title)}>Event not found</h1>
            <p {...stylex.props(styles.text, typography.sm)}>
                It may have been deleted. <Link href="/">Back to all events</Link>
            </p>
        </main>
    );
}
