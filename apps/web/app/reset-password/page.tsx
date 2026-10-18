import Link from "next/link";

import { AuthPage, ResetPasswordForm } from "@/modules/auth";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
    const { token } = await searchParams;

    return (
        <AuthPage title="Choose a new password" footer={<Link href="/forgot-password">Request a new link</Link>}>
            <ResetPasswordForm token={typeof token === "string" ? token : ""} />
        </AuthPage>
    );
}
