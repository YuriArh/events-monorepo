import { isIP } from "node:net";

import type { FastifyInstance, FastifyRequest } from "fastify";

const WINDOW = "15 minutes";

const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * Rate-limit key for a client address: IPv4 as is (IPv4-mapped IPv6 unwrapped),
 * IPv6 reduced to its /64 so rotating addresses inside one allocation can't
 * mint fresh buckets. Mirrors @fastify/rate-limit's default key.
 */
export const clientKey = (ip: string) => {
  const mapped = MAPPED_V4.exec(ip);

  if (mapped) return mapped[1] as string;
  if (isIP(ip) !== 6) return ip;

  const [head = "", tail] = (ip.split("%")[0] ?? ip).split("::");
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const headGroups = groups(head);
  const tailGroups = tail === undefined ? [] : groups(tail);
  const fill = tail === undefined ? 0 : Math.max(0, 8 - headGroups.length - tailGroups.length);
  const all = [...headGroups, ...Array<string>(fill).fill("0"), ...tailGroups];

  return all
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(":");
};

const bodyEmail = (request: FastifyRequest) => {
  const body = request.body as { email?: unknown } | undefined;

  return typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
};

/** Signed-in routes are limited per user; the IP is the fallback. */
const userOrIp = (request: FastifyRequest) => request.user?.id ?? clientKey(request.ip);

/**
 * In-memory, per process. Keys that read the body or request.user work
 * because the plugin runs at `preHandler` (see app.ts), after both exist.
 */
export const authRateLimits = {
  register: { max: 5, timeWindow: WINDOW },
  login: { max: 5, timeWindow: WINDOW, keyGenerator: (r: FastifyRequest) => `${clientKey(r.ip)}:${bodyEmail(r)}` },
  forgotPassword: { max: 3, timeWindow: WINDOW },
  resetPassword: { max: 10, timeWindow: WINDOW },
  verifyEmail: { max: 10, timeWindow: WINDOW },
  changePassword: { max: 5, timeWindow: WINDOW, keyGenerator: userOrIp },
  resendVerification: { max: 3, timeWindow: WINDOW, keyGenerator: userOrIp },
  deleteAccount: { max: 5, timeWindow: WINDOW, keyGenerator: userOrIp },
};

export type AuthRateLimitName = keyof typeof authRateLimits;

/** Route options carrying the named limit, or none when limits are off. */
export const rateLimitOption = (app: FastifyInstance, name: AuthRateLimitName) =>
  app.rateLimitsEnabled ? { config: { rateLimit: authRateLimits[name] } } : {};
