"use client";

import { useEffect, useState } from "react";

import { formatDate, formatEventWhen } from "@/lib/event-detail";

/*
 * The server can't know the viewer's time zone, so these islands render UTC
 * and re-format in the browser's zone after hydration (useEffect, so the first
 * client render matches the server HTML).
 */

/** Null during the server render and the first client render, then the browser's zone. */
const useViewerTimeZone = () => {
    const [timeZone, setTimeZone] = useState<string | null>(null);

    useEffect(() => {
        setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, []);

    return timeZone;
};

/** An event's start and end, labelled with the zone it is shown in. */
export function LocalDateTime({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
    const timeZone = useViewerTimeZone();
    const text = timeZone
        ? `${formatEventWhen(startsAt, endsAt, timeZone)} (${timeZone})`
        : `${formatEventWhen(startsAt, endsAt, "UTC")} UTC`;

    return (
        <time dateTime={startsAt} suppressHydrationWarning>
            {text}
        </time>
    );
}

/** A calendar day ("Oct 1, 2026"). */
export function LocalDate({ value }: { value: string }) {
    const timeZone = useViewerTimeZone();

    return (
        <time dateTime={value} suppressHydrationWarning>
            {formatDate(value, timeZone ?? "UTC")}
        </time>
    );
}
