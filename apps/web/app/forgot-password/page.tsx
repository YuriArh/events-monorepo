import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth-forms";
import { AuthPage } from "@/components/auth-page";

export default function ForgotPasswordPage() {
    return (
        <AuthPage title="Reset your password" footer={<Link href="/login">Back to sign in</Link>}>
            <ForgotPasswordForm />
        </AuthPage>
    );
}
