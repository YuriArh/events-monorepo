"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AuthPage, FormBanner, authStyles } from "@/components/auth-page";
import { authApi, meKey } from "@/lib/auth";
import { typography } from "@/styles/tokens.stylex";

function Verify() {
    const token = useSearchParams().get("token") ?? "";
    const queryClient = useQueryClient();
    const verify = useMutation({
        mutationFn: authApi.verifyEmail,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
    });
    // `mutate` is referentially stable; the mutation object itself is not.
    const { mutate } = verify;

    // The token is single-use. React StrictMode runs effects twice in
    // development, and a second POST would report "already used" over the
    // first one's success — so post exactly once.
    const started = useRef(false);
    useEffect(() => {
        if (started.current || !token) return;
        started.current = true;
        mutate({ token });
    }, [token, mutate]);

    if (!token) return <FormBanner message="This link is missing its token." />;
    if (verify.isError) return <FormBanner message={verify.error.message} />;

    return (
        <p role="status" {...stylex.props(authStyles.success, typography.sm)}>
            {verify.isSuccess ? "Your email is confirmed." : "Confirming your email…"}
        </p>
    );
}

export default function VerifyEmailPage() {
    return (
        <AuthPage title="Confirm your email" footer={<Link href="/">Go to events</Link>}>
            <Suspense>
                <Verify />
            </Suspense>
        </AuthPage>
    );
}
