/** The web app's origin (normalized, so a trailing slash or casing can't break the Origin check): CORS, the Origin check, and links in emails. */
export const WEB_ORIGIN = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000").origin;

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
