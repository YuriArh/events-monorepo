import Link from "next/link";

import { AuthPage, LoginForm, safeNext } from "@/modules/auth";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
    const { next } = await searchParams;

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
            {/* Validated here and again in the action: the hidden field is user input. */}
            <LoginForm next={safeNext(typeof next === "string" ? next : null)} />
        </AuthPage>
    );
}
