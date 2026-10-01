"use client";

import Link from "next/link";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";

import { Button, buttonStyleProps } from "@/components/ui/button";
import { authApi, useMe } from "@/lib/auth";
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
    const { data: me, isPending } = useMe();

    const logout = useMutation({
        mutationFn: authApi.logout,
        onSuccess: () => {
            // Full load: avoids the guarded page's redirect racing this navigation and clears the query cache.
            window.location.assign("/");
        },
    });

    return (
        <header {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.inner)}>
                <Link href="/" {...stylex.props(styles.brand)}>
                    Events
                </Link>

                {/* Render nothing until we know, so signed-in users never see a "Sign in" flash. */}
                {!isPending && (
                    <nav aria-label="Account" {...stylex.props(styles.nav)}>
                        {me ? (
                            <>
                                <span {...stylex.props(styles.who, typography.sm)}>{me.name ?? me.email}</span>
                                <Link href="/account" {...buttonStyleProps("ghost", "sm")}>
                                    Account
                                </Link>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={logout.isPending}
                                    onClick={() => logout.mutate()}>
                                    Sign out
                                </Button>
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
                )}
            </div>
        </header>
    );
}
