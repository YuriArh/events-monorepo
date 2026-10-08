"use client";

import { useActionState } from "react";
import Link from "next/link";
import * as stylex from "@stylexjs/stylex";

import { forgotPassword, login, register, resetPassword, verifyEmail } from "@/actions/auth";
import { FormBanner, authStyles } from "@/components/auth-page";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { uncoveredMessage } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";
import { typography } from "@/styles/tokens.stylex";

/*
 * The auth forms post to Server Actions, so they work before (or without)
 * JavaScript. HTML validation is the quick hint; the actions re-validate with
 * the contracts. React resets a form after its action, so typed values come
 * back through `state.values` (never passwords).
 */

/** The action's form-level error, or a field error no input on this form shows. */
const bannerFor = (state: FormState, fields: ReadonlySet<string>) =>
    state.formError ?? uncoveredMessage(state.fieldErrors ?? {}, fields);

const LOGIN_FIELDS = new Set(["email", "password"]);

export function LoginForm({ next }: { next: string }) {
    const [state, formAction, pending] = useActionState(login, {});

    return (
        <form action={formAction} {...stylex.props(authStyles.form)}>
            <input type="hidden" name="next" value={next} />
            <FormBanner message={bannerFor(state, LOGIN_FIELDS)} />
            <TextField
                id="email"
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                required
                defaultValue={state.values?.email}
                error={state.fieldErrors?.email}
            />
            <TextField
                id="password"
                name="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                error={state.fieldErrors?.password}
            />
            <div {...stylex.props(authStyles.actions)}>
                <Button type="submit" disabled={pending}>
                    Sign in
                </Button>
            </div>
        </form>
    );
}

const REGISTER_FIELDS = new Set(["name", "email", "password"]);

export function RegisterForm() {
    const [state, formAction, pending] = useActionState(register, {});

    return (
        <form action={formAction} {...stylex.props(authStyles.form)}>
            <FormBanner message={bannerFor(state, REGISTER_FIELDS)} />
            <TextField
                id="name"
                name="name"
                label="Name (optional)"
                autoComplete="name"
                maxLength={100}
                defaultValue={state.values?.name}
                error={state.fieldErrors?.name}
            />
            <TextField
                id="email"
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                required
                defaultValue={state.values?.email}
                error={state.fieldErrors?.email}
            />
            <TextField
                id="password"
                name="password"
                label="Password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                error={state.fieldErrors?.password}
            />
            <div {...stylex.props(authStyles.actions)}>
                <Button type="submit" disabled={pending}>
                    Create account
                </Button>
            </div>
        </form>
    );
}

const FORGOT_FIELDS = new Set(["email"]);

export function ForgotPasswordForm() {
    const [state, formAction, pending] = useActionState(forgotPassword, {});

    if (state.message) {
        return (
            <p role="status" {...stylex.props(authStyles.success, typography.sm)}>
                {state.message}
            </p>
        );
    }

    return (
        <form action={formAction} {...stylex.props(authStyles.form)}>
            <FormBanner message={bannerFor(state, FORGOT_FIELDS)} />
            <TextField
                id="email"
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                required
                defaultValue={state.values?.email}
                error={state.fieldErrors?.email}
            />
            <div {...stylex.props(authStyles.actions)}>
                <Button type="submit" disabled={pending}>
                    Send link
                </Button>
            </div>
        </form>
    );
}

const RESET_FIELDS = new Set(["newPassword"]);

export function ResetPasswordForm({ token }: { token: string }) {
    const [state, formAction, pending] = useActionState(resetPassword, {});

    if (state.message) {
        return (
            <p role="status" {...stylex.props(authStyles.success, typography.sm)}>
                {state.message} <Link href="/login">Sign in</Link> with the new password.
            </p>
        );
    }

    if (!token) return <FormBanner message="This link is missing its token. Request a new one." />;

    return (
        <form action={formAction} {...stylex.props(authStyles.form)}>
            <input type="hidden" name="token" value={token} />
            <FormBanner message={bannerFor(state, RESET_FIELDS)} />
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
                    Set password
                </Button>
            </div>
        </form>
    );
}

export function VerifyEmailForm({ token }: { token: string }) {
    const [state, formAction, pending] = useActionState(verifyEmail, {});

    if (state.message) {
        return (
            <p role="status" {...stylex.props(authStyles.success, typography.sm)}>
                {state.message}
            </p>
        );
    }

    if (!token) return <FormBanner message="This link is missing its token." />;

    return (
        <form action={formAction} {...stylex.props(authStyles.form)}>
            <input type="hidden" name="token" value={token} />
            <FormBanner message={state.formError ?? null} />
            <div {...stylex.props(authStyles.actions)}>
                <Button type="submit" disabled={pending}>
                    Confirm email
                </Button>
            </div>
        </form>
    );
}
