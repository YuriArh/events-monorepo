import Link from "next/link";

import { RegisterForm } from "@/modules/auth/components/auth-forms";
import { AuthPage } from "@/modules/auth/components/auth-page";

export default function RegisterPage() {
    return (
        <AuthPage
            title="Create an account"
            description="We'll email you a link to confirm your address."
            footer={
                <>
                    Already have an account? <Link href="/login">Sign in</Link>
                </>
            }>
            <RegisterForm />
        </AuthPage>
    );
}
