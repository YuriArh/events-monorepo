"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { applySessionCookie, serverFetch } from "@/lib/api.server";
import { SESSION_COOKIE } from "@/lib/session";

export async function logout() {
    const response = await serverFetch("/api/auth/logout", { method: "POST" });
    await applySessionCookie(response);
    // Signed out on this origin even if the API call failed or set no cookie.
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/");
}
