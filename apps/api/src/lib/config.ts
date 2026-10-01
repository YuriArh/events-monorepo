/** The web app's origin (normalized, so a trailing slash or casing can't break the Origin check): CORS, the Origin check, and links in emails. */
export const WEB_ORIGIN = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000").origin;

/**
 * Secure cookies whenever the web app is served over HTTPS. Derived from the
 * origin rather than NODE_ENV, so a deployment that forgets NODE_ENV still
 * gets Secure cookies.
 */
export const COOKIE_SECURE = new URL(WEB_ORIGIN).protocol === "https:";

/**
 * Development conveniences (the console mailer) need an explicit opt-in:
 * an unset or unknown NODE_ENV is treated like production, so a
 * misconfigured deployment fails closed.
 */
export const IS_DEV_OR_TEST = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
