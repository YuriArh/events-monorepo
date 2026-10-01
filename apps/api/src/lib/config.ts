/** The web app's origin: CORS, the Origin check, and links in emails. */
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
