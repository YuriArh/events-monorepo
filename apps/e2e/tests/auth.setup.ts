import { expect, test as setup } from "@playwright/test";

import { API_URL, E2E_PASSWORD, STORAGE_STATE, e2eEmail } from "./support/auth.js";

/** One user per run; every spec in the "chromium" project starts signed in as it. */
setup("register the e2e user", async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
        data: { email: e2eEmail("runner"), password: E2E_PASSWORD, name: "E2E runner" },
    });
    expect(response.status()).toBe(201);

    await request.storageState({ path: STORAGE_STATE });
});
