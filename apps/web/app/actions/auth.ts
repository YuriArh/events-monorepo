"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { RedirectType, redirect } from "next/navigation";
import {
    forgotPasswordInput,
    loginInput,
    registerInput,
    resetPasswordInput,
    verifyEmailInput,
} from "@repo/contracts";

import { issuesByField } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";
import { SESSION_COOKIE, safeNext } from "@/lib/session";

import { apiFailure, post, textFields } from "./shared";

/*
 * Server Actions for the auth forms (used with useActionState). `redirect`
 * throws, so it is never inside a try/catch. Passwords are never echoed back.
 */

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
    const data = textFields(formData);
    const values = { email: data.email ?? "" };
    const parsed = loginInput.safeParse(data);
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues), values };

    const response = await post("/api/auth/login", parsed.data);
    // 401 carries the deliberately vague "Invalid email or password".
    if (!response.ok) return apiFailure(response, values);

    // Replace: Back shouldn't return to the sign-in form.
    redirect(safeNext(data.next), RedirectType.replace);
}

export async function register(_state: FormState, formData: FormData): Promise<FormState> {
    const data = textFields(formData);
    const values = { email: data.email ?? "", name: data.name ?? "" };
    const parsed = registerInput.safeParse({
        email: data.email,
        password: data.password,
        // An empty name means "no name", not an invalid one.
        name: data.name?.trim() ? data.name : undefined,
    });
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues), values };

    const response = await post("/api/auth/register", parsed.data);
    if (response.status === 409) return { fieldErrors: { email: "Email already registered" }, values };
    if (!response.ok) return apiFailure(response, values);

    redirect("/", RedirectType.replace);
}

export async function forgotPassword(_state: FormState, formData: FormData): Promise<FormState> {
    const data = textFields(formData);
    const values = { email: data.email ?? "" };
    const parsed = forgotPasswordInput.safeParse(data);
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues), values };

    const response = await post("/api/auth/password/forgot", parsed.data);
    if (!response.ok) return apiFailure(response, values);

    // Same text whether or not the account exists — the API answers 204 either way.
    return { message: "If an account exists for that email, we've sent a link to reset the password." };
}

export async function resetPassword(_state: FormState, formData: FormData): Promise<FormState> {
    const parsed = resetPasswordInput.safeParse(textFields(formData));
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues) };

    const response = await post("/api/auth/password/reset", parsed.data);
    if (!response.ok) return apiFailure(response);

    // The API revoked that account's sessions; re-render so the header shows it.
    revalidatePath("/", "layout");
    return { message: "Your password has been changed and you've been signed out everywhere." };
}

export async function verifyEmail(_state: FormState, formData: FormData): Promise<FormState> {
    const parsed = verifyEmailInput.safeParse(textFields(formData));
    if (!parsed.success) return { formError: "This link is missing its token." };

    const response = await post("/api/auth/email/verify", parsed.data);
    if (!response.ok) return apiFailure(response);

    revalidatePath("/", "layout");
    return { message: "Your email is confirmed." };
}

export async function logout() {
    // Whatever the API answers — even when it is unreachable and its session
    // row outlives this — the visitor is signed out on this origin.
    await post("/api/auth/logout");
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/");
}
