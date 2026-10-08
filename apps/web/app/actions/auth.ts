"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { applySessionCookie, serverFetch } from "@/lib/api.server";
import { SESSION_COOKIE } from "@/lib/session";

export async function logout() {
    try {
        const response = await serverFetch("/api/auth/logout", { method: "POST" });
        await applySessionCookie(response);
    } catch (error) {
        // The API is unreachable: its session row outlives this, but the visitor
        // is still signed out here — dropping the cookie below is what matters.
        console.error("logout: API call failed", error);
    }
    // Always, whatever the API said: signed out on this origin.
    (await cookies()).delete(SESSION_COOKIE);
    // Outside the try: redirect works by throwing.
    redirect("/");
}
