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

    // Capture the address id created for this event now, while the event
    // still exists: the "delete" step below removes the event through the
    // UI, and deleting an Event does not delete its Address (the FK nulls
    // the other way around). Editing the name doesn't change the venue, so
    // this id stays valid through the rest of the test.
    const createdEvents: Array<{ id: string; name: string; addressId: string | null }> =
        await (await request.get(`${API_URL}/api/events`)).json();
    const addressId = createdEvents.find((candidate) => candidate.name === name)?.addressId ?? null;

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

    // The UI delete above only removes the Event row, leaving this test's
    // Address orphaned. Remove it via the id captured right after creation,
    // so this cleanup never touches a developer's own address data.
    if (addressId !== null) {
        await request.delete(`${API_URL}/api/addresses/${addressId}`);
    }

    // Clean up anything a previous, incomplete run left behind in the shared
    // dev database (e.g. a run that failed before reaching the "delete" step
    // above). Scoped to "E2E event*" events so it never deletes a developer's
    // own data.
    const response = await request.get(`${API_URL}/api/events`);
    const events: Array<{ id: string; name: string; addressId: string | null }> =
        await response.json();
    const leftoverEvents = events.filter((candidate) => candidate.name.startsWith("E2E event"));
    for (const event of leftoverEvents) {
        await request.delete(`${API_URL}/api/events/${event.id}`);
    }
    for (const leftoverAddressId of leftoverEvents
        .map((event) => event.addressId)
        .filter((candidate): candidate is string => candidate !== null)) {
        await request.delete(`${API_URL}/api/addresses/${leftoverAddressId}`);
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
