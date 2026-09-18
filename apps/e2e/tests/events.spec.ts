import { expect, test } from "@playwright/test";

const API_URL = "http://localhost:4000";

/** Names are unique per run so specs don't collide with existing dev data. */
const uniqueName = (label: string) => `${label} ${Date.now()}`;

const deleteEventByName = async (request: import("@playwright/test").APIRequestContext, name: string) => {
    const response = await request.get(`${API_URL}/api/events`);
    const events: Array<{ id: string; name: string }> = await response.json();

    for (const event of events.filter((candidate) => candidate.name === name)) {
        await request.delete(`${API_URL}/api/events/${event.id}`);
    }
};

test("creates, edits and deletes an event", async ({ page, request }) => {
    const name = uniqueName("E2E event");
    const renamed = `${name} (edited)`;

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();

    await test.step("create", async () => {
        await page.getByRole("button", { name: "New Event" }).click();
        await page.getByLabel("Name").fill(name);
        await page.getByRole("button", { name: "Create" }).click();

        await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
    });

    await test.step("edit", async () => {
        await page.getByRole("button", { name: `Edit ${name}` }).click();
        await page.getByLabel("Name").fill(renamed);
        await page.getByRole("button", { name: "Save" }).click();

        await expect(page.getByRole("cell", { name: renamed, exact: true })).toBeVisible();
        await expect(page.getByRole("cell", { name, exact: true })).toBeHidden();
    });

    await test.step("delete", async () => {
        await page.getByRole("button", { name: `Delete ${renamed}` }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();

        await expect(page.getByRole("cell", { name: renamed, exact: true })).toBeHidden();
    });

    await deleteEventByName(request, renamed);
});

test("rejects an empty name", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "New Event" }).click();
    await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
});
