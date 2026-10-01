"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { registerInput } from "@repo/contracts";

import { AuthPage, FormBanner, authStyles } from "@/components/auth-page";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authApi, meKey } from "@/lib/auth";
import { issuesByField } from "@/lib/event-form";

export default function RegisterPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [banner, setBanner] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const form = useForm({
        defaultValues: { name: "", email: "", password: "" },
        onSubmit: async ({ value }) => {
            setBanner(null);
            setFieldErrors({});

            const parsed = registerInput.safeParse({
                email: value.email,
                password: value.password,
                // An empty name means "no name", not an invalid one.
                name: value.name.trim() === "" ? undefined : value.name,
            });
            if (!parsed.success) {
                setFieldErrors(issuesByField(parsed.error.issues));
                return;
            }

            try {
                const me = await authApi.register(parsed.data);
                queryClient.setQueryData(meKey, me);
                router.replace("/");
            } catch (error) {
                if (error instanceof ApiError && error.status === 409) {
                    setFieldErrors({ email: error.message });
                } else if (error instanceof ApiError && error.issues) {
                    setFieldErrors(issuesByField(error.issues));
                } else {
                    setBanner(error instanceof Error ? error.message : "Something went wrong");
                }
            }
        },
    });

    return (
        <AuthPage
            title="Create an account"
            description="We'll email you a link to confirm your address."
            footer={
                <>
                    Already have an account? <Link href="/login">Sign in</Link>
                </>
            }>
            <form
                {...stylex.props(authStyles.form)}
                onSubmit={(event) => {
                    event.preventDefault();
                    form.handleSubmit();
                }}>
                <FormBanner message={banner} />

                <form.Field name="name">
                    {(field) => (
                        <TextField
                            id="name"
                            label="Name (optional)"
                            autoComplete="name"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={field.handleChange}
                            error={fieldErrors.name}
                        />
                    )}
                </form.Field>

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
                            autoComplete="new-password"
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
                                Create account
                            </Button>
                        )}
                    </form.Subscribe>
                </div>
            </form>
        </AuthPage>
    );
}
