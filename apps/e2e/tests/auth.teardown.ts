import { test as teardown } from "@playwright/test";

import { API_URL, E2E_PASSWORD, STORAGE_STATE } from "./support/auth.js";

/**
 * Deletes the run's events, then the user. Order matters: once the user is
 * gone their events become ownerless, and only an admin could delete them.
 */
teardown("delete the e2e user", async ({ playwright }) => {
    const request = await playwright.request.newContext({ storageState: STORAGE_STATE });

    const me = await (await request.get(`${API_URL}/api/auth/me`)).json();
    const events: Array<{ id: string; organizerId: string | null }> = await (
        await request.get(`${API_URL}/api/events`)
    ).json();

    for (const event of events.filter((candidate) => candidate.organizerId === me.user.id)) {
        await request.delete(`${API_URL}/api/events/${event.id}`);
    }

    await request.delete(`${API_URL}/api/users/me`, { data: { password: E2E_PASSWORD } });
    await request.dispose();
});
