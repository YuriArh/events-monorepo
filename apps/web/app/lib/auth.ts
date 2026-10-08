"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type {
    ChangePasswordInput,
    DeleteAccountInput,
    ForgotPasswordInput,
    LoginInput,
    RegisterInput,
    ResetPasswordInput,
    UpdateProfileInput,
    VerifyEmailInput,
} from "@repo/contracts";

import { request } from "./api";
import { fetchMe, meQuery } from "./queries";
import type { Me } from "./session";

/*
 * Temporary compatibility layer for pages not yet moved to Server Components /
 * Server Actions (removed in Task 7). New code imports from lib/session.ts,
 * lib/queries.ts and app/actions directly.
 */
export { meKey } from "./queries";
export { type Me, canModifyEvent, safeNext } from "./session";

const post = <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const authApi = {
    /** Null when signed out — a normal state, not an error. */
    me: (): Promise<Me | null> => fetchMe(request),
    register: async (input: RegisterInput) => (await post<{ user: Me }>("/api/auth/register", input)).user,
    login: async (input: LoginInput) => (await post<{ user: Me }>("/api/auth/login", input)).user,
    logout: () => post<void>("/api/auth/logout"),
    logoutAll: () => post<void>("/api/auth/logout-all"),
    forgotPassword: (input: ForgotPasswordInput) => post<void>("/api/auth/password/forgot", input),
    resetPassword: (input: ResetPasswordInput) => post<void>("/api/auth/password/reset", input),
    verifyEmail: (input: VerifyEmailInput) => post<void>("/api/auth/email/verify", input),
    resendVerification: () => post<void>("/api/auth/email/resend"),
    changePassword: (input: ChangePasswordInput) => post<void>("/api/auth/password/change", input),
    updateProfile: async (input: UpdateProfileInput) =>
        (await request<{ user: Me }>("/api/users/me", { method: "PATCH", body: JSON.stringify(input) })).user,
    deleteAccount: (input: DeleteAccountInput) =>
        request<void>("/api/users/me", { method: "DELETE", body: JSON.stringify(input) }),
};

export const useMe = () => useQuery(meQuery());

/**
 * For pages that need a user: redirects to /login?next=<this page> once we
 * know nobody is signed in. Render nothing user-specific until `ready`.
 */
export const useRequireUser = () => {
    const router = useRouter();
    // pathname only: the query string is intentionally not preserved (useSearchParams would force a Suspense boundary on every guarded page).
    const pathname = usePathname();
    const { data: me, isPending } = useMe();

    useEffect(() => {
        if (!isPending && me === null) {
            router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
    }, [isPending, me, pathname, router]);

    return { me: me ?? null, ready: !isPending && me != null };
};
