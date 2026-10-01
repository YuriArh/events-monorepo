import fs from "node:fs";

import { test as teardown } from "@playwright/test";

import { API_URL, E2E_PASSWORD, STORAGE_STATE } from "./support/auth.js";

/**
 * Deletes the run's events, then the user. Order matters: once the user is
 * gone their events become ownerless, and only an admin could delete them —
 * so if any event delete fails, the user is kept and the teardown fails.
 */
teardown("delete the e2e user", async ({ playwright }) => {
    if (!fs.existsSync(STORAGE_STATE)) {
        console.log("e2e teardown: no storage state (setup did not run or failed); nothing to clean up");
        return;
    }

    const request = await playwright.request.newContext({ storageState: STORAGE_STATE });
    try {
        const meResponse = await request.get(`${API_URL}/api/auth/me`);
        const me: { user?: { id: string } | null } = meResponse.ok() ? await meResponse.json() : {};
        if (!me.user) {
            console.log(`e2e teardown: stored session is not signed in (${meResponse.status()}); skipping`);
            return;
        }
        const userId = me.user.id;

        const events: Array<{ id: string; organizerId: string | null }> = await (
            await request.get(`${API_URL}/api/events`)
        ).json();

        const failed: string[] = [];
        for (const event of events.filter((candidate) => candidate.organizerId === userId)) {
            const response = await request.delete(`${API_URL}/api/events/${event.id}`);
            if (!response.ok()) failed.push(`${event.id} (${response.status()})`);
        }
        if (failed.length > 0) {
            throw new Error(
                `e2e teardown: could not delete events ${failed.join(", ")}; kept the e2e user so they stay deletable`,
            );
        }

        const deleted = await request.delete(`${API_URL}/api/users/me`, { data: { password: E2E_PASSWORD } });
        if (deleted.status() !== 204) {
            throw new Error(`e2e teardown: deleting the e2e user answered ${deleted.status()}`);
        }
    } finally {
        await request.dispose();
    }
});
