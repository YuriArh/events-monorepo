import { createHash, randomBytes } from "node:crypto";

/** 256 bits of randomness: session cookies, reset and verification links. */
export const generateToken = () => randomBytes(32).toString("base64url");

/**
 * What the database stores instead of the token. sha256, not argon2: the
 * token is already unguessable, so there is nothing to slow down, and every
 * authenticated request hashes one.
 */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
