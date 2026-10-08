import { redirect } from "next/navigation";
import * as stylex from "@stylexjs/stylex";

import { AccountSections } from "@/components/account-sections";
import { getMe } from "@/lib/session.server";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "36rem",
        marginInline: "auto",
        paddingInline: "1rem",
        paddingBlock: "3.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
    },
    title: { fontSize: "1.875rem", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.025em" },
});

export default async function AccountPage() {
    if (!(await getMe())) redirect(`/login?next=${encodeURIComponent("/account")}`);

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <h1 {...stylex.props(styles.title)}>Account</h1>
                <AccountSections />
            </main>
        </div>
    );
}
