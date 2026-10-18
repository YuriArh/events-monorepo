import type { FastifyRequest } from "fastify";
import { type RateLimitOptions, normalizeIP } from "@fastify/rate-limit";

/** IPv4 as is (IPv4-mapped IPv6 unwrapped), IPv6 grouped by /64 so one allocation is one client. */
const ip = (request: FastifyRequest) => normalizeIP(request.ip);

/** Read before validation, normalized like the service does, so case and spaces can't mint new keys. */
const email = (request: FastifyRequest) => {
  const body = request.body as { email?: unknown } | undefined;

  return typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
};

/** Signed-in routes are limited per user; the address is the fallback. */
const userOrIp = (request: FastifyRequest) => request.user?.id ?? ip(request);

/**
 * A route's `config.rateLimit`. `cache` is set here because the plugin-level
 * option doesn't reach per-route stores, and their default of 5000 keys lets a
 * flood of throwaway keys evict (and so reset) a victim's counter.
 */
export const limit = (
  max: number,
  keyGenerator: (request: FastifyRequest) => string,
  options: Pick<RateLimitOptions, "timeWindow" | "continueExceeding"> = {}
): RateLimitOptions => ({ max, keyGenerator, timeWindow: "15 minutes", cache: 100_000, ...options });

/** One limit per route: the plugin runs only the first rate-limit hook of a request. */
export const rateLimits = {
  register: limit(5, ip),
  // Requests made while blocked restart the window: the key is the client's own address.
  login: limit(5, (request) => `${ip(request)}:${email(request)}`, { continueExceeding: true }),
  forgotPassword: limit(3, email, { timeWindow: "1 hour" }),
  resetPassword: limit(10, ip),
  verifyEmail: limit(10, ip),
  changePassword: limit(5, userOrIp),
  resendVerification: limit(3, userOrIp),
  deleteAccount: limit(5, userOrIp),
  upload: limit(20, userOrIp),
};
