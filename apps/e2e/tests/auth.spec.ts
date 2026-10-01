import { expect, test } from "@playwright/test";
import type { PlaywrightWorkerArgs } from "@playwright/test";

import { API_URL, E2E_PASSWORD, e2eEmail } from "./support/auth.js";

// These start signed out, not as the shared e2e user.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Removes what the flow test created, whatever step it stopped at. Uses its
 * own request context (not the page's cookies, which may be signed out by
 * then): signs in as the test user, deletes its event, then the account.
 * The account is kept if an event delete fails, so the event never becomes
 * an ownerless row only an admin could remove.
 */
async function cleanUpFlowUser(
    playwright: PlaywrightWorkerArgs["playwright"],
    email: string,
    eventName: string,
) {
    const request = await playwright.request.newContext();
    try {
        const login = await request.post(`${API_URL}/api/auth/login`, {
            data: { email, password: E2E_PASSWORD },
        });
        // 401: the test failed before the account was created; nothing to do.
        if (login.status() === 401) return;
        expect(login.ok(), `cleanup sign-in answered ${login.status()}`).toBe(true);

        const { user } = await (await request.get(`${API_URL}/api/auth/me`)).json();
        const events: Array<{ id: string; name: string; organizerId: string | null }> = await (
            await request.get(`${API_URL}/api/events`)
        ).json();

        const failed: string[] = [];
        for (const event of events.filter(
            (candidate) => candidate.name === eventName && candidate.organizerId === user.id,
        )) {
            const response = await request.delete(`${API_URL}/api/events/${event.id}`);
            if (!response.ok()) failed.push(`${event.id} (${response.status()})`);
        }
        expect(failed, "cleanup could not delete these events; the user was kept").toEqual([]);

        const deleted = await request.delete(`${API_URL}/api/users/me`, { data: { password: E2E_PASSWORD } });
        expect(deleted.status(), "cleanup could not delete the user").toBe(204);
    } finally {
        await request.dispose();
    }
}

test("redirects a guarded page to sign-in when signed out", async ({ page }) => {
    await page.goto("/events/new");

    await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fnew$/);
});

test("register, own an event, sign out, sign back in", async ({ page, playwright }) => {
    const email = e2eEmail("flow");
    const eventName = `E2E auth event ${Date.now()}`;

    try {
        await test.step("register", async () => {
            await page.goto("/register");
            await page.getByLabel("Email").fill(email);
            await page.getByLabel("Password").fill(E2E_PASSWORD);
            await page.getByRole("button", { name: "Create account" }).click();

            await expect(page).toHaveURL(/\/$/);
            await expect(page.getByRole("navigation", { name: "Account" })).toContainText(email);
        });

        await test.step("own an event", async () => {
            // page.request shares the browser's cookies, so this is the new user.
            const created = await page.request.post(`${API_URL}/api/events`, { data: { name: eventName } });
            expect(created.status()).toBe(201);

            await page.reload();
            await expect(page.getByRole("link", { name: `Edit ${eventName}` })).toBeVisible();
        });

        await test.step("sign out hides the controls", async () => {
            await page.getByRole("button", { name: "Sign out" }).click();

            await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
            await expect(page.getByRole("cell", { name: eventName, exact: true })).toBeVisible();
            await expect(page.getByRole("link", { name: `Edit ${eventName}` })).toBeHidden();
        });

        await test.step("a wrong password is refused", async () => {
            await page.getByRole("link", { name: "Sign in" }).click();
            await page.getByLabel("Email").fill(email);
            await page.getByLabel("Password").fill("not the password");
            await page.getByRole("button", { name: "Sign in" }).click();

            // By text, not getByRole("alert"): Next.js renders its own route
            // announcer with role="alert", which would make that ambiguous.
            await expect(page.getByText("Invalid email or password")).toBeVisible();
        });

        await test.step("sign back in", async () => {
            await page.getByLabel("Email").fill(email);
            await page.getByLabel("Password").fill(E2E_PASSWORD);
            await page.getByRole("button", { name: "Sign in" }).click();

            await expect(page).toHaveURL(/\/$/);
            await expect(page.getByRole("link", { name: `Edit ${eventName}` })).toBeVisible();
        });
    } finally {
        await cleanUpFlowUser(playwright, email, eventName);
    }
});
