import { SESSION_COOKIE } from "./session";

/** The API's Set-Cookie for the session, reduced to what we re-issue on the web origin. Null if absent. */
export const parseSessionSetCookie = (setCookies: string[]) => {
    const raw = setCookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
    if (!raw) return null;

    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const value = (pair ?? "").slice(SESSION_COOKIE.length + 1);
    const expiresAttr = attributes.find((attr) => attr.toLowerCase().startsWith("expires="));

    return {
        value,
        expires: expiresAttr ? new Date(expiresAttr.slice("expires=".length)) : undefined,
        secure: attributes.some((attr) => attr.toLowerCase() === "secure"),
    };
};
