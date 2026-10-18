import Link from "next/link";

import { AuthPage, ForgotPasswordForm } from "@/modules/auth";

export default function ForgotPasswordPage() {
    return (
        <AuthPage title="Reset your password" footer={<Link href="/login">Back to sign in</Link>}>
            <ForgotPasswordForm />
        </AuthPage>
    );
}
