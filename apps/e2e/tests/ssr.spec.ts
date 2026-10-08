import { expect, test } from "@playwright/test";

import { API_URL, E2E_PASSWORD, e2eEmail } from "./support/auth.js";

test("the server HTML already contains the signed-in user and the events", async ({ request, baseURL }) => {
    const name = `E2E event ssr ${Date.now()}`;
    const created = await request.post(`${API_URL}/api/events`, { data: { name } });
    expect(created.status()).toBe(201);

    try {
        const html = await (await request.get(`${baseURL}/`)).text();
        expect(html).toContain("E2E runner");
        expect(html).toContain(name);
    } finally {
        expect((await request.delete(`${API_URL}/api/events/${(await created.json()).id}`)).status()).toBe(204);
    }
});

test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("a guarded page redirects in the HTTP response", async ({ request, baseURL }) => {
        const response = await request.get(`${baseURL}/events/new`, { maxRedirects: 0 });

        expect([303, 307, 308]).toContain(response.status());
        expect(response.headers().location).toContain("/login?next=%2Fevents%2Fnew");
    });
});

test.describe("without JavaScript", () => {
    test.use({ storageState: { cookies: [], origins: [] }, javaScriptEnabled: false });

    test("signing in works and the header shows the user", async ({ page, playwright }) => {
        const email = e2eEmail("nojs");
        const api = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
        expect(
            (await api.post(`${API_URL}/api/auth/register`, { data: { email, password: E2E_PASSWORD } })).status(),
        ).toBe(201);

        try {
            await page.goto("/login");
            await page.getByLabel("Email").fill(email);
            await page.getByLabel("Password").fill(E2E_PASSWORD);
            await page.getByRole("button", { name: "Sign in" }).click();

            await expect(page).toHaveURL(/\/$/);
            await expect(page.getByRole("navigation", { name: "Account" })).toContainText(email);
        } finally {
            expect(
                (await api.delete(`${API_URL}/api/users/me`, { data: { password: E2E_PASSWORD } })).status(),
            ).toBe(204);
            await api.dispose();
        }
    });
});
