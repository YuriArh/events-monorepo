import type { Address } from "./events";

const dayFormat = (timeZone?: string) =>
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone });

const timeFormat = (timeZone?: string) =>
    new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });

/** "Thu, Oct 1, 2026 · 18:00 – 21:00". `timeZone` defaults to the runtime's (the viewer's, in the browser). */
export const formatEventWhen = (startsAt: string, endsAt: string | null, timeZone?: string) => {
    const day = dayFormat(timeZone);
    const time = timeFormat(timeZone);
    const start = new Date(startsAt);
    const startText = `${day.format(start)} · ${time.format(start)}`;

    if (!endsAt) return startText;

    const end = new Date(endsAt);

    return day.format(start) === day.format(end)
        ? `${startText} – ${time.format(end)}`
        : `${startText} – ${day.format(end)} · ${time.format(end)}`;
};

/** "Oct 1, 2026". `timeZone` defaults to the runtime's (the viewer's, in the browser). */
export const formatDate = (value: string, timeZone?: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(
        new Date(value),
    );

export const formatAddressLines = (
    address: Pick<Address, "label" | "line1" | "line2" | "city" | "region" | "postalCode" | "country">,
) =>
    [
        address.label,
        address.line1,
        address.line2,
        [address.postalCode, address.city].filter(Boolean).join(" "),
        address.region,
        address.country,
    ].filter((line): line is string => Boolean(line));

/** ~1 km box around the point; enough context without a zoom parameter (the embed has none). */
const BOX = 0.005;

export const osmEmbedUrl = (lat: number, lon: number) => {
    const bbox = [lon - BOX, lat - BOX, lon + BOX, lat + BOX].map((value) => value.toFixed(5)).join(",");
    const params = new URLSearchParams({ bbox, layer: "mapnik", marker: `${lat},${lon}` });

    return `https://www.openstreetmap.org/export/embed.html?${params}`;
};

export const osmLinkUrl = (address: Pick<Address, "lat" | "lon" | "line1" | "city" | "country">) =>
    address.lat !== null && address.lon !== null
        ? `https://www.openstreetmap.org/?mlat=${address.lat}&mlon=${address.lon}#map=17/${address.lat}/${address.lon}`
        : `https://www.openstreetmap.org/search?query=${encodeURIComponent(
              [address.line1, address.city, address.country].join(", "),
          )}`;
