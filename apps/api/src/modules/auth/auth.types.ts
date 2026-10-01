import type { z } from "@repo/contracts";

import type { loginSchema, registerSchema } from "./auth.schema.js";

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Recorded on the session row so a future "your devices" list has something to show. */
export type SessionMeta = { userAgent: string | null; ip: string | null };
