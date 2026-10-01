import { expect, test } from "@playwright/test";

import { API_URL, E2E_PASSWORD, e2eEmail } from "./support/auth.js";

// These start signed out, not as the shared e2e user.
test.use({ storageState: { cookies: [], origins: [] } });

test("redirects to sign-in and back", async ({ page }) => {
    await page.goto("/events/new");

    await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fnew$/);
});

test("register, own an event, sign out, sign back in", async ({ page }) => {
    const email = e2eEmail("flow");
    const eventName = `E2E auth event ${Date.now()}`;

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
        await page.getByLabel("Password").fill(E2E_PASSWORD);
        await page.getByRole("button", { name: "Sign in" }).click();

        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole("link", { name: `Edit ${eventName}` })).toBeVisible();
    });

    // Clean up as this user: its event first (deleting the user would leave it
    // ownerless), then the account.
    const events: Array<{ id: string; name: string }> = await (
        await page.request.get(`${API_URL}/api/events`)
    ).json();
    const own = events.find((candidate) => candidate.name === eventName);
    if (own) await page.request.delete(`${API_URL}/api/events/${own.id}`);
    await page.request.delete(`${API_URL}/api/users/me`, { data: { password: E2E_PASSWORD } });
});
