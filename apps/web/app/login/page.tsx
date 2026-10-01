"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { loginInput } from "@repo/contracts";

import { AuthPage, FormBanner, authStyles } from "@/components/auth-page";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authApi, meKey, safeNext } from "@/lib/auth";
import { issuesByField } from "@/lib/event-form";

function LoginForm() {
    const router = useRouter();
    const next = safeNext(useSearchParams().get("next"));
    const queryClient = useQueryClient();
    const [banner, setBanner] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const form = useForm({
        defaultValues: { email: "", password: "" },
        onSubmit: async ({ value }) => {
            setBanner(null);
            setFieldErrors({});

            const parsed = loginInput.safeParse(value);
            if (!parsed.success) {
                setFieldErrors(issuesByField(parsed.error.issues));
                return;
            }

            try {
                const me = await authApi.login(parsed.data);
                queryClient.setQueryData(meKey, me);
                router.replace(next);
            } catch (error) {
                // 401 carries the deliberately vague "Invalid email or password".
                setBanner(error instanceof ApiError ? error.message : "Something went wrong");
            }
        },
    });

    return (
        <form
            {...stylex.props(authStyles.form)}
            onSubmit={(event) => {
                event.preventDefault();
                form.handleSubmit();
            }}>
            <FormBanner message={banner} />

            <form.Field name="email">
                {(field) => (
                    <TextField
                        id="email"
                        label="Email"
                        type="email"
                        autoComplete="email"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={field.handleChange}
                        error={fieldErrors.email}
                    />
                )}
            </form.Field>

            <form.Field name="password">
                {(field) => (
                    <TextField
                        id="password"
                        label="Password"
                        type="password"
                        autoComplete="current-password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={field.handleChange}
                        error={fieldErrors.password}
                    />
                )}
            </form.Field>

            <div {...stylex.props(authStyles.actions)}>
                <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(isSubmitting) => (
                        <Button type="submit" disabled={isSubmitting}>
                            Sign in
                        </Button>
                    )}
                </form.Subscribe>
            </div>
        </form>
    );
}

export default function LoginPage() {
    return (
        <AuthPage
            title="Sign in"
            footer={
                <>
                    <Link href="/forgot-password">Forgot your password?</Link>
                    {" · "}
                    <Link href="/register">Create an account</Link>
                </>
            }>
            {/* useSearchParams needs a Suspense boundary in the App Router. */}
            <Suspense>
                <LoginForm />
            </Suspense>
        </AuthPage>
    );
}
