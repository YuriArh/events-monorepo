export type { LoginInput, RegisterInput } from "@repo/contracts";

/** Recorded on the session row so a future "your devices" list has something to show. */
export type SessionMeta = { userAgent: string | null; ip: string | null };
