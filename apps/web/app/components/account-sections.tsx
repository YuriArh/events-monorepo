"use client";

import { useActionState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { changePassword, deleteAccount, logoutAll, resendVerification, updateProfile } from "@/actions/account";
import { FormBanner, FormSuccess, authStyles } from "@/components/auth-page";
import { Card, CardContent } from "@/components/card";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { NO_FIELDS, bannerFor } from "@/lib/form-errors";
import { meQuery } from "@/lib/queries";
import { colors, typography } from "@/styles/tokens.stylex";

/*
 * The account page's five sections, each a form posting a Server Action.
 * `me` comes from the query cache the layout hydrated.
 */

const styles = stylex.create({
    sections: { display: "flex", flexDirection: "column", gap: "1.5rem" },
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

const PROFILE_FIELDS = new Set(["name"]);

function ProfileSection({ name, email }: { name: string | null; email: string }) {
    const [state, formAction, pending] = useActionState(updateProfile, {});

    return (
        <Section title="Profile">
            <form action={formAction} {...stylex.props(authStyles.form)}>
                <FormBanner message={bannerFor(state, PROFILE_FIELDS)} />
                <p {...stylex.props(styles.muted, typography.sm)}>{email}</p>
                <TextField
                    id="name"
                    name="name"
                    label="Name"
                    autoComplete="name"
                    maxLength={100}
                    defaultValue={state.values?.name ?? name ?? ""}
                    error={state.fieldErrors?.name}
                />
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" disabled={pending}>
                        {state.message ? "Saved" : "Save"}
                    </Button>
                </div>
            </form>
        </Section>
    );
}

function VerificationSection() {
    const [state, formAction, pending] = useActionState(resendVerification, {});

    return (
        <Section title="Confirm your email">
            <form action={formAction} {...stylex.props(authStyles.form)}>
                <FormBanner message={bannerFor(state, NO_FIELDS)} />
                <p {...stylex.props(styles.muted, typography.sm)}>
                    {state.message ?? "We sent you a link when you signed up."}
                </p>
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" variant="outline" disabled={pending}>
                        Send a new link
                    </Button>
                </div>
            </form>
        </Section>
    );
}

const PASSWORD_FIELDS = new Set(["currentPassword", "newPassword"]);

function PasswordSection() {
    const [state, formAction, pending] = useActionState(changePassword, {});

    return (
        <Section title="Password">
            <form action={formAction} {...stylex.props(authStyles.form)}>
                <FormBanner message={bannerFor(state, PASSWORD_FIELDS)} />
                <FormSuccess message={state.message} />
                <TextField
                    id="currentPassword"
                    name="currentPassword"
                    label="Current password"
                    type="password"
                    autoComplete="current-password"
                    required
                    error={state.fieldErrors?.currentPassword}
                />
                <TextField
                    id="newPassword"
                    name="newPassword"
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    error={state.fieldErrors?.newPassword}
                />
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" disabled={pending}>
                        Change password
                    </Button>
                </div>
            </form>
        </Section>
    );
}

function SessionsSection() {
    const [state, formAction, pending] = useActionState(logoutAll, {});

    return (
        <Section title="Sessions">
            <form action={formAction} {...stylex.props(authStyles.form)}>
                <FormBanner message={bannerFor(state, NO_FIELDS)} />
                <p {...stylex.props(styles.muted, typography.sm)}>Sign out on every device, including this one.</p>
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" variant="outline" disabled={pending}>
                        Sign out everywhere
                    </Button>
                </div>
            </form>
        </Section>
    );
}

const DELETE_FIELDS = new Set(["password"]);

function DeleteSection() {
    const [state, formAction, pending] = useActionState(deleteAccount, {});

    return (
        <Section title="Delete account">
            <form action={formAction} {...stylex.props(authStyles.form)}>
                <p {...stylex.props(styles.muted, typography.sm)}>
                    Your events stay listed without an organizer. This cannot be undone.
                </p>
                <FormBanner message={bannerFor(state, DELETE_FIELDS)} />
                <TextField
                    id="deletePassword"
                    name="password"
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    required
                    error={state.fieldErrors?.password}
                />
                <div {...stylex.props(authStyles.actions)}>
                    <Button type="submit" variant="destructive" disabled={pending}>
                        Delete my account
                    </Button>
                </div>
            </form>
        </Section>
    );
}

export function AccountSections() {
    const { data: me } = useQuery(meQuery());

    // The page's guard already sent signed-out visitors away; this is the brief
    // moment after a session-ending action, before the redirect lands.
    if (!me) return null;

    return (
        <div {...stylex.props(styles.sections)}>
            <ProfileSection name={me.name} email={me.email} />
            {!me.emailVerifiedAt && <VerificationSection />}
            <PasswordSection />
            <SessionsSection />
            <DeleteSection />
        </div>
    );
}
