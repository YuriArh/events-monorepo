import * as stylex from "@stylexjs/stylex";

import { Card, CardContent } from "@/components/ui/card";
import { colors, radius, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "26rem",
        marginInline: "auto",
        paddingInline: "1rem",
        paddingBlock: "3.5rem",
    },
    header: { marginBottom: "1.5rem" },
    title: { fontSize: "1.5rem", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.025em" },
    description: { marginTop: "0.5rem", color: colors.mutedForeground },
    footer: { marginTop: "1.25rem", textAlign: "center", color: colors.mutedForeground },
});

/** Shared styles for the forms inside an AuthPage. */
export const authStyles = stylex.create({
    form: { display: "flex", flexDirection: "column", gap: "1.25rem" },
    banner: {
        borderRadius: radius.lg,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: `color-mix(in oklab, ${colors.destructive} 30%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${colors.destructive} 10%, transparent)`,
        color: colors.destructive,
        paddingInline: "1rem",
        paddingBlock: "0.75rem",
    },
    success: {
        borderRadius: radius.lg,
        backgroundColor: colors.muted,
        paddingInline: "1rem",
        paddingBlock: "0.75rem",
    },
    actions: { display: "flex", justifyContent: "flex-end", gap: "0.5rem" },
});

export function AuthPage({
    title,
    description,
    footer,
    children,
}: {
    title: string;
    description?: string;
    footer?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <h1 {...stylex.props(styles.title)}>{title}</h1>
                    {description && <p {...stylex.props(styles.description, typography.sm)}>{description}</p>}
                </div>
                <Card>
                    <CardContent>{children}</CardContent>
                </Card>
                {footer && <div {...stylex.props(styles.footer, typography.sm)}>{footer}</div>}
            </main>
        </div>
    );
}

/** The error banner shown for issues no field renders inline. */
export function FormBanner({ message }: { message: string | null }) {
    if (!message) return null;

    return (
        <div role="alert" {...stylex.props(authStyles.banner, typography.sm)}>
            {message}
        </div>
    );
}
