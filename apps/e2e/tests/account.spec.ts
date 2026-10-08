import { expect, test } from "@playwright/test";

import { E2E_PASSWORD, e2eEmail } from "./support/auth.js";

// A fresh user rather than the shared e2e one: this renames it.
test.use({ storageState: { cookies: [], origins: [] } });

test("changing the name on the account page updates the header", async ({ page }) => {
    const email = e2eEmail("account");
    const name = `E2E renamed ${Date.now()}`;
    // Through the web origin's /api: page.request shares the browser's cookies,
    // so the page is signed in as this user.
    const registered = await page.request.post("/api/auth/register", { data: { email, password: E2E_PASSWORD } });
    expect(registered.status()).toBe(201);

    try {
        await page.goto("/account");
        const header = page.getByRole("navigation", { name: "Account" });
        await expect(header).toContainText(email);

        await page.getByLabel("Name").fill(name);
        await page.getByRole("button", { name: "Save" }).click();

        await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
        await expect(header).toContainText(name);
    } finally {
        const deleted = await page.request.delete("/api/users/me", { data: { password: E2E_PASSWORD } });
        expect(deleted.status(), "cleanup could not delete the user").toBe(204);
    }
});
