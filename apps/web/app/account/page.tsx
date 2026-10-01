"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { changePasswordInput, updateProfileInput } from "@repo/contracts";

import { FormBanner, authStyles } from "@/components/auth-page";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type Me, authApi, meKey, useRequireUser } from "@/lib/auth";
import { colors, typography } from "@/styles/tokens.stylex";

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
    sectionTitle: { fontWeight: 600, marginBottom: "1rem" },
    muted: { color: colors.mutedForeground },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card>
            <CardContent>
                <h2 {...stylex.props(styles.sectionTitle)}>{title}</h2>
                {children}
            </CardContent>
        </Card>
    );
}

function ProfileSection({ me }: { me: Me }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(me.name ?? "");
    const save = useMutation({
        mutationFn: authApi.updateProfile,
        onSuccess: (updated) => queryClient.setQueryData(meKey, updated),
    });

    return (
        <Section title="Profile">
            <form
                noValidate
                {...stylex.props(authStyles.form)}
                onSubmit={(event) => {
                    event.preventDefault();
                    const parsed = updateProfileInput.safeParse({ name: name.trim() === "" ? null : name });
                    if (parsed.success) save.mutate(parsed.data);
                }}>
                <FormBanner message={save.error ? save.error.message : null} />
                <p {...stylex.props(styles.muted, typography.sm)}>{me.email}</p>
                <TextField id="name" label="Name" autoComplete="name" value={name} onChange={setName} />
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" disabled={save.isPending}>
                        {save.isSuccess ? "Saved" : "Save"}
                    </Button>
                </div>
            </form>
        </Section>
    );
}

function VerificationSection({ me }: { me: Me }) {
    const resend = useMutation({ mutationFn: authApi.resendVerification });

    if (me.emailVerifiedAt) return null;

    return (
        <Section title="Confirm your email">
            <p {...stylex.props(styles.muted, typography.sm)}>
                {resend.isSuccess ? "Sent. Check your inbox." : "We sent you a link when you signed up."}
            </p>
            <div {...stylex.props(authStyles.actions)}>
                <Button variant="outline" disabled={resend.isPending} onClick={() => resend.mutate()}>
                    Send a new link
                </Button>
            </div>
        </Section>
    );
}

function PasswordSection() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [fieldError, setFieldError] = useState<string | undefined>();
    const change = useMutation({
        mutationFn: authApi.changePassword,
        onSuccess: () => {
            setCurrentPassword("");
            setNewPassword("");
        },
    });

    return (
        <Section title="Password">
            <form
                noValidate
                {...stylex.props(authStyles.form)}
                onSubmit={(event) => {
                    event.preventDefault();
                    const parsed = changePasswordInput.safeParse({ currentPassword, newPassword });
                    setFieldError(parsed.success ? undefined : "Use 8 to 128 characters");
                    if (parsed.success) change.mutate(parsed.data);
                }}>
                <FormBanner message={change.error ? change.error.message : null} />
                {change.isSuccess && (
                    <p role="status" {...stylex.props(authStyles.success, typography.sm)}>
                        Password changed. Other devices have been signed out.
                    </p>
                )}
                <TextField
                    id="currentPassword"
                    label="Current password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                />
                <TextField
                    id="newPassword"
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={setNewPassword}
                    error={fieldError}
                />
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" disabled={change.isPending}>
                        Change password
                    </Button>
                </div>
            </form>
        </Section>
    );
}

function SessionsSection() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const logoutAll = useMutation({
        mutationFn: authApi.logoutAll,
        onSuccess: () => {
            queryClient.setQueryData(meKey, null);
            router.push("/login");
        },
    });

    return (
        <Section title="Sessions">
            <p {...stylex.props(styles.muted, typography.sm)}>Sign out on every device, including this one.</p>
            <div {...stylex.props(authStyles.actions)}>
                <Button variant="outline" disabled={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
                    Sign out everywhere
                </Button>
            </div>
        </Section>
    );
}

function DeleteSection() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [password, setPassword] = useState("");
    const remove = useMutation({
        mutationFn: authApi.deleteAccount,
        onSuccess: () => {
            queryClient.setQueryData(meKey, null);
            router.push("/");
        },
    });

    return (
        <Section title="Delete account">
            <form
                noValidate
                {...stylex.props(authStyles.form)}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (password) remove.mutate({ password });
                }}>
                <p {...stylex.props(styles.muted, typography.sm)}>
                    Your events stay listed without an organizer. This cannot be undone.
                </p>
                <FormBanner message={remove.error ? remove.error.message : null} />
                <TextField
                    id="deletePassword"
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={setPassword}
                />
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" variant="destructive" disabled={remove.isPending || !password}>
                        Delete my account
                    </Button>
                </div>
            </form>
        </Section>
    );
}

export default function AccountPage() {
    const { me, ready } = useRequireUser();

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <h1 {...stylex.props(styles.title)}>Account</h1>
                {ready && me && (
                    <>
                        <ProfileSection me={me} />
                        <VerificationSection me={me} />
                        <PasswordSection />
                        <SessionsSection />
                        <DeleteSection />
                    </>
                )}
            </main>
        </div>
    );
}
