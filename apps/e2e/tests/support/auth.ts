import path from "node:path";
import { fileURLToPath } from "node:url";

export const API_URL = "http://localhost:4000";

/** Cookies of the signed-in e2e user, written by auth.setup.ts. Gitignored. */
export const STORAGE_STATE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../playwright/.auth/user.json",
);

export const E2E_PASSWORD = "e2e password 1234";

/** Unique per call, recognisable as test data. */
export const e2eEmail = (label: string) => `e2e-${label}-${Date.now()}@example.test`;
