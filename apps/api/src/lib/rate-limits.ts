import type { FastifyInstance, FastifyRequest } from "fastify";

const WINDOW = "15 minutes";

const bodyEmail = (request: FastifyRequest) => {
  const body = request.body as { email?: unknown } | undefined;

  return typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
};

/** Signed-in routes are limited per user; the IP is the fallback. */
const userOrIp = (request: FastifyRequest) => request.user?.id ?? request.ip;

/**
 * In-memory, per process. Keys that read the body or request.user work
 * because the plugin runs at `preHandler` (see app.ts), after both exist.
 */
export const authRateLimits = {
  register: { max: 5, timeWindow: WINDOW },
  login: { max: 5, timeWindow: WINDOW, keyGenerator: (r: FastifyRequest) => `${r.ip}:${bodyEmail(r)}` },
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
