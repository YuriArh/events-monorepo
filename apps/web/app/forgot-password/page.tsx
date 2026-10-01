"use client";

import { useState } from "react";
import Link from "next/link";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { forgotPasswordInput } from "@repo/contracts";

import { AuthPage, FormBanner, authStyles } from "@/components/auth-page";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/auth";
import { typography } from "@/styles/tokens.stylex";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [fieldError, setFieldError] = useState<string | undefined>();

    const request = useMutation({ mutationFn: authApi.forgotPassword });

    return (
        <AuthPage title="Reset your password" footer={<Link href="/login">Back to sign in</Link>}>
            {request.isSuccess ? (
                // The same message whether or not the account exists — the API
                // answers 204 either way, so this page can't reveal it either.
                <p role="status" {...stylex.props(authStyles.success, typography.sm)}>
                    If an account exists for that email, we've sent a link to reset the password.
                </p>
            ) : (
                <form
                    noValidate
                    {...stylex.props(authStyles.form)}
                    onSubmit={(event) => {
                        event.preventDefault();
                        const parsed = forgotPasswordInput.safeParse({ email });
                        setFieldError(parsed.success ? undefined : "Enter a valid email");
                        if (parsed.success) request.mutate(parsed.data);
                    }}>
                    <FormBanner message={request.error ? request.error.message : null} />
                    <TextField
                        id="email"
                        label="Email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={setEmail}
                        error={fieldError}
                    />
                    <div {...stylex.props(authStyles.actions)}>
                        <Button type="submit" disabled={request.isPending}>
                            Send link
                        </Button>
                    </div>
                </form>
            )}
        </AuthPage>
    );
}
