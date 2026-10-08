/** The web app's origin (normalized, so a trailing slash or casing can't break the Origin check): the Origin check, the Secure cookie flag, and links in emails. */
export const WEB_ORIGIN = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000").origin;

/**
 * Secure cookies whenever the web app is served over HTTPS. Derived from the
 * origin rather than NODE_ENV, so a deployment that forgets NODE_ENV still
 * gets Secure cookies.
 */
export const COOKIE_SECURE = new URL(WEB_ORIGIN).protocol === "https:";

/**
 * Proxies whose X-Forwarded-For we believe (comma-separated addresses/CIDRs):
 * the dev Next proxy on loopback by default; in production both nginx's and
 * the Next server's addresses (docs/architecture.md → Deploying).
 * Trusting nobody makes every visitor share the proxy's IP; trusting everybody
 * lets anyone spoof the header and dodge rate limits.
 */
export const TRUSTED_PROXY = (process.env.TRUSTED_PROXY ?? "127.0.0.1,::1")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

/**
 * Development conveniences (the console mailer) need an explicit opt-in:
 * an unset or unknown NODE_ENV is treated like production, so a
 * misconfigured deployment fails closed.
 */
export const IS_DEV_OR_TEST = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
