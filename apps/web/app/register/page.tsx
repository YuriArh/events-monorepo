import Link from "next/link";

import { AuthPage, RegisterForm } from "@/modules/auth";

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
