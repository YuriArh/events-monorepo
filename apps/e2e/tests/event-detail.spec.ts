import { expect, test } from "@playwright/test";

import { API_URL } from "./support/auth.js";

const VENUE = {
    label: "E2E Hall",
    line1: "Nieuwmarkt 4",
    city: "Amsterdam",
    postalCode: "1012 CR",
    country: "Netherlands",
    lat: 52.3723,
    lon: 4.9002,
};

test.describe("event detail page", () => {
    let eventId: string;
    let name: string;

    test.beforeEach(async ({ request }) => {
        name = `E2E event detail ${Date.now()}`;
        const response = await request.post(`${API_URL}/api/events`, {
            data: { name, description: "Line one\nLine two", startsAt: "2030-05-01T18:00:00.000Z", address: VENUE },
        });
        expect(response.status()).toBe(201);
        eventId = (await response.json()).id;
    });

    test.afterEach(async ({ request }) => {
        const response = await request.delete(`${API_URL}/api/events/${eventId}`);
        expect([200, 204, 404]).toContain(response.status());
    });

    test("opens from the list and shows the event", async ({ page }) => {
        await page.goto("/");
        await page.getByRole("link", { name, exact: true }).click();

        await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        await expect(page.getByText(/^Organized by /)).toBeVisible();
        await expect(page.getByText("Nieuwmarkt 4")).toBeVisible();
        await expect(page.locator(`iframe[title="Map of ${VENUE.label}"]`)).toBeVisible();
        await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
    });

    test("is rendered on the server", async ({ request, baseURL }) => {
        const response = await request.get(`${baseURL}/events/${eventId}`);

        expect(response.status()).toBe(200);
        expect(await response.text()).toContain(name);
    });

    test("hides owner actions from signed-out visitors", async ({ browser, baseURL }) => {
        const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const page = await context.newPage();

        await page.goto(`${baseURL}/events/${eventId}`);
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        await expect(page.getByRole("link", { name: "Edit" })).toBeHidden();

        await context.close();
    });
});

test("responds 404 for an unknown event", async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/events/does-not-exist`);

    expect(response.status()).toBe(404);
});
