"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { changePasswordInput, deleteAccountInput, updateProfileInput } from "@repo/contracts";

import { issuesByField } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";
import { SESSION_COOKIE } from "@/lib/session";

import { apiFailure, post, send, textFields } from "./shared";

/*
 * Server Actions for the account page's forms (used with useActionState).
 * `redirect` throws, so it is never inside a try/catch. Passwords are never
 * echoed back; only the profile name is.
 */

export async function updateProfile(_state: FormState, formData: FormData): Promise<FormState> {
    const data = textFields(formData);
    const values = { name: data.name ?? "" };
    // An empty name means "no name", not an invalid one.
    const parsed = updateProfileInput.safeParse({ name: data.name?.trim() ? data.name : null });
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues), values };

    const response = await send("PATCH", "/api/users/me", parsed.data);
    if (!response.ok) return apiFailure(response, values);

    // Re-render the layout so the header and the cached `me` show the new name.
    revalidatePath("/", "layout");
    // React resets the form after the action, so echo what was saved.
    return { message: "Saved", values: { name: parsed.data.name ?? "" } };
}

export async function changePassword(_state: FormState, formData: FormData): Promise<FormState> {
    const parsed = changePasswordInput.safeParse(textFields(formData));
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues) };

    const response = await post("/api/auth/password/change", parsed.data);
    if (!response.ok) return apiFailure(response);

    return { message: "Password changed. Other devices have been signed out." };
}

export async function resendVerification(_state: FormState, _formData: FormData): Promise<FormState> {
    const response = await post("/api/auth/email/resend");
    if (!response.ok) return apiFailure(response);

    return { message: "Sent. Check your inbox." };
}

export async function logoutAll(_state: FormState, _formData: FormData): Promise<FormState> {
    const response = await post("/api/auth/logout-all");
    if (!response.ok) return apiFailure(response);

    // The API cleared it (relayed by `post`); make sure of it on this origin too.
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/login");
}

export async function deleteAccount(_state: FormState, formData: FormData): Promise<FormState> {
    const parsed = deleteAccountInput.safeParse(textFields(formData));
    if (!parsed.success) return { fieldErrors: issuesByField(parsed.error.issues) };

    const response = await send("DELETE", "/api/users/me", parsed.data);
    if (!response.ok) return apiFailure(response);

    (await cookies()).delete(SESSION_COOKIE);
    redirect("/");
}
