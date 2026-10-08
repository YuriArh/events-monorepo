"use client";

import Link from "next/link";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { logout } from "@/actions/auth";
import { Button, buttonStyleProps } from "@/components/ui/button";
import { meKey, meQuery } from "@/lib/queries";
import { colors, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    header: {
        borderBottomWidth: "1px",
        borderBottomStyle: "solid",
        borderBottomColor: colors.border,
        backgroundColor: colors.background,
    },
    inner: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: { default: "1rem", "@media (min-width: 640px)": "1.5rem" },
        paddingBlock: "0.75rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
    },
    brand: { fontWeight: 600, color: colors.foreground, textDecoration: "none" },
    nav: { display: "flex", alignItems: "center", gap: "0.5rem" },
    who: { color: colors.mutedForeground },
});

export function SiteHeader() {
    // Prefetched by the root layout, so this is the visitor from the first render on.
    const { data: me } = useQuery(meQuery());
    const queryClient = useQueryClient();

    return (
        <header {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.inner)}>
                <Link href="/" {...stylex.props(styles.brand)}>
                    Events
                </Link>

                <nav aria-label="Account" {...stylex.props(styles.nav)}>
                    {me ? (
                        <>
                            <span {...stylex.props(styles.who, typography.sm)}>{me.name ?? me.email}</span>
                            <Link href="/account" {...buttonStyleProps("ghost", "sm")}>
                                Account
                            </Link>
                            {/* Still a plain form submission (works without JS); onSubmit only
                                drops the cached user at once, so a header re-rendered before the
                                server's answer can't show it signed in. */}
                            <form action={logout} onSubmit={() => queryClient.setQueryData(meKey, null)}>
                                <Button type="submit" variant="outline" size="sm">
                                    Sign out
                                </Button>
                            </form>
                        </>
                    ) : (
                        <>
                            <Link href="/login" {...buttonStyleProps("ghost", "sm")}>
                                Sign in
                            </Link>
                            <Link href="/register" {...buttonStyleProps("default", "sm")}>
                                Register
                            </Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
}
