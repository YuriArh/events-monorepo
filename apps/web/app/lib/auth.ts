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
    UserPublic,
    VerifyEmailInput,
} from "@repo/contracts";

import { ApiError, request } from "./api";

export type Me = UserPublic;

export const meKey = ["me"] as const;

const post = <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const authApi = {
    /** Null when signed out — a normal state, not an error. */
    me: async (): Promise<Me | null> => {
        try {
            return (await request<{ user: Me }>("/api/auth/me")).user;
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) return null;
            throw error;
        }
    },
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

export const useMe = () => useQuery({ queryKey: meKey, queryFn: authApi.me });

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

/**
 * Only same-site relative paths. Anything else — an absolute URL, a
 * protocol-relative "//host", "/\host", or "/\t/host" (the URL parser strips
 * tab/LF/CR, leaving "//host") — would turn the login page into an open redirect.
 */
export const safeNext = (next: string | null | undefined) => {
    if (!next?.startsWith("/")) return "/";
    // Resolve against a dummy origin the way the browser would; anything that
    // escapes it (//host, /\host, control-char tricks) is not a same-site path.
    const resolved = new URL(next, "http://same.invalid");
    return resolved.origin === "http://same.invalid"
        ? `${resolved.pathname}${resolved.search}${resolved.hash}`
        : "/";
};

/** Mirrors the API's `canModify`. Hides controls; the API is what enforces it. */
export const canModifyEvent = (me: Me | null | undefined, event: { organizerId: string | null }) =>
    !!me && (me.role === "ADMIN" || (event.organizerId !== null && event.organizerId === me.id));
