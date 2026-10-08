import Link from "next/link";

import { VerifyEmailForm } from "@/components/auth-forms";
import { AuthPage } from "@/components/auth-page";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function VerifyEmailPage({ searchParams }: Props) {
    const { token } = await searchParams;

    return (
        <AuthPage title="Confirm your email" footer={<Link href="/">Go to events</Link>}>
            {/*
             * A button, not a confirmation on render: the token is single-use,
             * and rendering can happen more than once — a refresh, a link
             * prefetch, a mail client's link scanner — each of which would spend
             * it. Only a deliberate POST from the visitor does.
             */}
            <VerifyEmailForm token={typeof token === "string" ? token : ""} />
        </AuthPage>
    );
}
