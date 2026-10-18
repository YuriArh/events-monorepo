import Link from "next/link";

import { ResetPasswordForm } from "@/modules/auth/components/auth-forms";
import { AuthPage } from "@/modules/auth/components/auth-page";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
    const { token } = await searchParams;

    return (
        <AuthPage title="Choose a new password" footer={<Link href="/forgot-password">Request a new link</Link>}>
            <ResetPasswordForm token={typeof token === "string" ? token : ""} />
        </AuthPage>
    );
}
