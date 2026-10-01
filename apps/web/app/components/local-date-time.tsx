"use client";

import { useEffect, useState } from "react";

import { formatEventWhen } from "@/lib/event-detail";

/**
 * The server can't know the viewer's time zone, so it renders UTC and this
 * island re-formats in the browser's zone after hydration (useEffect, so the
 * first client render matches the server HTML).
 */
export function LocalDateTime({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
    const [text, setText] = useState(() => `${formatEventWhen(startsAt, endsAt, "UTC")} UTC`);

    useEffect(() => {
        setText(formatEventWhen(startsAt, endsAt));
    }, [startsAt, endsAt]);

    return <time dateTime={startsAt}>{text}</time>;
}
