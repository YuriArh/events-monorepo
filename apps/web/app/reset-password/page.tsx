"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { resetPasswordInput } from "@repo/contracts";

import { AuthPage, FormBanner, authStyles } from "@/components/auth-page";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/auth";
import { typography } from "@/styles/tokens.stylex";

function ResetForm() {
    const token = useSearchParams().get("token") ?? "";
    const [newPassword, setNewPassword] = useState("");
    const [fieldError, setFieldError] = useState<string | undefined>();

    const reset = useMutation({ mutationFn: authApi.resetPassword });

    if (reset.isSuccess) {
        return (
            <p role="status" {...stylex.props(authStyles.success, typography.sm)}>
                Your password has been changed and you've been signed out everywhere.{" "}
                <Link href="/login">Sign in</Link> with the new password.
            </p>
        );
    }

    if (!token) {
        return <FormBanner message="This link is missing its token. Request a new one." />;
    }

    return (
        <form
            noValidate
            {...stylex.props(authStyles.form)}
            onSubmit={(event) => {
                event.preventDefault();
                const parsed = resetPasswordInput.safeParse({ token, newPassword });
                setFieldError(parsed.success ? undefined : "Use 8 to 128 characters");
                if (parsed.success) reset.mutate(parsed.data);
            }}>
            <FormBanner message={reset.error ? reset.error.message : null} />
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
                <Button type="submit" disabled={reset.isPending}>
                    Set password
                </Button>
            </div>
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <AuthPage title="Choose a new password" footer={<Link href="/forgot-password">Request a new link</Link>}>
            <Suspense>
                <ResetForm />
            </Suspense>
        </AuthPage>
    );
}
