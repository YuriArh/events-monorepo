import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const API_URL = "http://localhost:4000";
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/event.png");

/** Names are unique per run so specs don't collide with existing dev data. */
const uniqueName = (label: string) => `${label} ${Date.now()}`;

test("creates an event with every field, then edits and deletes it", async ({ page, request }) => {
    const name = uniqueName("E2E event");
    const renamed = `${name} (edited)`;

    await page.goto("/");
    // "New Event" navigates (an <a>, styled as a button), so its accessible role is "link".
    await page.getByRole("link", { name: "New Event" }).click();
    await expect(page).toHaveURL(/\/events\/new$/);

    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Description").fill("Created by the e2e suite");
    await page.getByLabel("Starts").fill("2026-10-01T18:00");
    await page.getByLabel("Ends").fill("2026-10-01T21:00");
    await page.getByLabel("Image").setInputFiles(FIXTURE);

    await page.getByLabel("Street", { exact: true }).fill("1 Civic Square");
    await page.getByLabel("City").fill("Amsterdam");
    await page.getByLabel("Country").fill("NL");

    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await test.step("edit", async () => {
        // Same as "New Event" above: the row's edit control is a navigation link.
        await page.getByRole("link", { name: `Edit ${name}` }).click();
        await expect(page).toHaveURL(/\/edit$/);

        await page.getByLabel("Name", { exact: true }).fill(renamed);
        await page.getByLabel("Image").setInputFiles(FIXTURE);
        await page.getByRole("button", { name: "Save" }).click();

        await expect(page.getByRole("cell", { name: renamed, exact: true })).toBeVisible();
    });

    await test.step("delete", async () => {
        await page.getByRole("button", { name: `Delete ${renamed}` }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();

        await expect(page.getByRole("cell", { name: renamed, exact: true })).toBeHidden();
    });

    // Clean up anything the run left behind in the shared dev database.
    const response = await request.get(`${API_URL}/api/events`);
    const events: Array<{ id: string; name: string }> = await response.json();
    for (const event of events.filter((candidate) => candidate.name.startsWith("E2E event"))) {
        await request.delete(`${API_URL}/api/events/${event.id}`);
    }
});

test("blocks submitting without a name", async ({ page }) => {
    await page.goto("/events/new");

    await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
});

test("requires street, city and country together", async ({ page }) => {
    await page.goto("/events/new");

    await page.getByLabel("Name", { exact: true }).fill(uniqueName("Partial venue"));
    await page.getByLabel("City").fill("Amsterdam");
    await page.getByRole("button", { name: "Create" }).click();

    // The hint text above the venue fields ("Optional. Street, city and country
    // are required together.") also matches this substring, so anchor on the
    // full form-level error message to avoid a strict-mode ambiguity.
    await expect(
        page.getByText("Street, city and country are required when a venue is given."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/events\/new$/);
});
