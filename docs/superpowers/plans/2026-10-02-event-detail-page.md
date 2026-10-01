# Event detail page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A server-rendered `/events/[id]` page showing an event's cover, name, local-time dates, organizer, description and venue with an OpenStreetMap embed, reached by clicking the event name in the list.

**Architecture:** The page is a Server Component that fetches the public event via the existing `request()` wrapped in `React.cache` (shared with `generateMetadata`). Only two client islands: `LocalDateTime` (viewer's time zone) and `EventOwnerActions` (Edit/Delete via `useMe`). The API adds the organizer's public fields to event responses. Pure formatting/URL helpers live in `lib/event-detail.ts` with unit tests.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, TanStack Query 5, StyleX, Fastify 5 + Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-event-detail-page-design.md`

## Global Constraints

- Principles from `AGENTS.md`: KISS, DRY, server rendering first — `"use client"` only on the smallest island that needs the browser.
- Never hand-edit `apps/web/app/components/ui/**`. StyleX only.
- A Server Component must not import from a `"use client"` module anything other than components to render (e.g. no `buttonStyleProps` from a client `ui/button.tsx`). Check a module for `"use client"` before importing it into a server file.
- The organizer's email is never selected or returned.
- Next.js here differs from older versions: read `apps/web/node_modules/next/dist/docs/` (`01-app/03-api-reference/04-functions/not-found.md`, `generate-metadata.md`, and the Server/Client Components guide) before writing Next code. `params` is a Promise.
- API: relative imports use `.js`; 2-space source, 4-space tests. Web: 4-space indentation.
- Each task ends with `pnpm check-types && pnpm lint && pnpm test` green (zero lint warnings).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

| File | Change |
| --- | --- |
| `apps/api/src/modules/events/event.repository.ts` | include organizer `{ id, name }` |
| `apps/api/src/modules/events/event.routes.test.ts` | organizer in responses, no email |
| `apps/web/app/lib/events.ts` | `EventRecord.organizer` |
| `apps/web/app/lib/event-detail.ts` (+ `.test.ts`) | `formatEventWhen`, `formatAddressLines`, `osmEmbedUrl`, `osmLinkUrl` |
| `apps/web/app/components/delete-event-dialog.tsx` | extracted confirmation dialog |
| `apps/web/app/page.tsx` | name links to detail; uses `DeleteEventDialog` |
| `apps/web/app/lib/events.server.ts` | `getEvent` (cached, null on 404) |
| `apps/web/app/components/local-date-time.tsx` | client island |
| `apps/web/app/components/event-owner-actions.tsx` | client island |
| `apps/web/app/events/[id]/page.tsx` | Server Component page + `generateMetadata` |
| `apps/web/app/events/[id]/not-found.tsx` | 404 UI |
| `apps/e2e/tests/event-detail.spec.ts` | e2e |
| `docs/architecture.md` | route list |

---

### Task 1: API — organizer's public fields in event responses

**Files:**
- Modify: `apps/api/src/modules/events/event.repository.ts` (the `withAddress` const and its uses)
- Test: `apps/api/src/modules/events/event.routes.test.ts`

**Interfaces:**
- Produces: every event response includes `organizer: { id: string; name: string | null } | null`.

- [ ] **Step 1: Write the failing test**

Append to `event.routes.test.ts`:

```ts
describe("organizer in responses", () => {
    it("includes the organizer's id and name but never the email", async () => {
        const ada = await signUp(app, { name: "Ada Organizer" });
        const created = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json", cookie: ada.cookie },
            payload: { name: "Ada's event" },
        });

        const detail = await app.inject({ method: "GET", url: `/api/events/${created.json().id}` });
        const list = await app.inject({ method: "GET", url: "/api/events" });

        expect(detail.json().organizer).toEqual({ id: ada.user.id, name: "Ada Organizer" });
        expect(list.json()[0].organizer).toEqual({ id: ada.user.id, name: "Ada Organizer" });
        expect(detail.body).not.toContain(ada.email);
        expect(list.body).not.toContain(ada.email);
    });

    it("is null for an event without an organizer", async () => {
        const created = await createEvent();
        await prisma.event.update({ where: { id: created.id }, data: { organizerId: null } });

        const detail = await app.inject({ method: "GET", url: `/api/events/${created.id}` });

        expect(detail.json().organizer).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api exec vitest run src/modules/events/event.routes.test.ts -t "organizer in responses"`
Expected: FAIL — `organizer` is `undefined`.

- [ ] **Step 3: Implement**

In `event.repository.ts`, replace `const withAddress = { address: true } as const;` with:

```ts
/**
 * What every event response carries: the venue, and the organizer's public
 * fields only — never their email.
 */
const withRelations = {
  address: true,
  organizer: { select: { id: true, name: true } },
} as const;
```

and rename every `include: withAddress` to `include: withRelations`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter api check-types && pnpm --filter api lint && pnpm --filter api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/events
git commit -m "Include the organizer's public fields in event responses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Web — detail helpers, shared delete dialog, list links

**Files:**
- Modify: `apps/web/app/lib/events.ts` (`EventRecord`)
- Create: `apps/web/app/lib/event-detail.ts`, `apps/web/app/lib/event-detail.test.ts`
- Create: `apps/web/app/components/delete-event-dialog.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: any `EventRecord` fixtures in `apps/web/app/lib/*.test.ts` (add `organizer: null`)

**Interfaces:**
- Consumes: Task 1's `organizer` field.
- Produces:
  - `formatEventWhen(startsAt: string, endsAt: string | null, timeZone?: string): string`
  - `formatAddressLines(address: Address): string[]`
  - `osmEmbedUrl(lat: number, lon: number): string`
  - `osmLinkUrl(address: Pick<Address, "lat" | "lon" | "line1" | "city" | "country">): string`
  - `DeleteEventDialog({ event, onClose, onDeleted? }: { event: EventRecord | null; onClose: () => void; onDeleted?: () => void })`

- [ ] **Step 1: Write the failing helper tests**

`apps/web/app/lib/event-detail.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatAddressLines, formatEventWhen, osmEmbedUrl, osmLinkUrl } from "./event-detail";

describe("formatEventWhen", () => {
    it("shows one date and a time range for a same-day event", () => {
        expect(formatEventWhen("2026-10-01T18:00:00.000Z", "2026-10-01T21:00:00.000Z", "UTC")).toBe(
            "Thu, Oct 1, 2026 · 18:00 – 21:00",
        );
    });

    it("shows both dates when the event ends on another day", () => {
        expect(formatEventWhen("2026-10-01T18:00:00.000Z", "2026-10-02T10:00:00.000Z", "UTC")).toBe(
            "Thu, Oct 1, 2026 · 18:00 – Fri, Oct 2, 2026 · 10:00",
        );
    });

    it("shows only the start when there is no end", () => {
        expect(formatEventWhen("2026-10-01T18:00:00.000Z", null, "UTC")).toBe("Thu, Oct 1, 2026 · 18:00");
    });

    it("formats in the given time zone", () => {
        expect(formatEventWhen("2026-10-01T23:30:00.000Z", null, "Asia/Almaty")).toBe("Fri, Oct 2, 2026 · 04:30");
    });
});

describe("formatAddressLines", () => {
    it("drops empty parts and joins postal code with city", () => {
        expect(
            formatAddressLines({
                label: "Town Hall",
                line1: "1 Civic Square",
                line2: null,
                city: "Amsterdam",
                region: null,
                postalCode: "1011 AB",
                country: "NL",
            }),
        ).toEqual(["Town Hall", "1 Civic Square", "1011 AB Amsterdam", "NL"]);
    });
});

describe("osmEmbedUrl", () => {
    it("centres a small box on the point and drops a marker", () => {
        const url = new URL(osmEmbedUrl(52.3723, 4.9002));

        expect(url.origin + url.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
        expect(url.searchParams.get("bbox")).toBe("4.89520,52.36730,4.90520,52.37730");
        expect(url.searchParams.get("marker")).toBe("52.3723,4.9002");
    });
});

describe("osmLinkUrl", () => {
    it("links to the coordinates when known", () => {
        expect(osmLinkUrl({ lat: 52.3723, lon: 4.9002, line1: "x", city: "y", country: "z" })).toBe(
            "https://www.openstreetmap.org/?mlat=52.3723&mlon=4.9002#map=17/52.3723/4.9002",
        );
    });

    it("falls back to an address search", () => {
        expect(
            osmLinkUrl({ lat: null, lon: null, line1: "1 Civic Square", city: "Amsterdam", country: "NL" }),
        ).toBe("https://www.openstreetmap.org/search?query=1%20Civic%20Square%2C%20Amsterdam%2C%20NL");
    });
});
```

Run: `pnpm --filter web test` → FAIL (`./event-detail` not found).

- [ ] **Step 2: Implement the helpers**

`apps/web/app/lib/event-detail.ts`:

```ts
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
```

In `apps/web/app/lib/events.ts` add to `EventRecord` after `organizerId`:

```ts
    /** Public fields only; null for events created before accounts existed. */
    organizer: { id: string; name: string | null } | null;
```

and add `organizer: null` to every `EventRecord` fixture flagged by `pnpm --filter web check-types`.

Run: `pnpm --filter web test` → the new tests PASS.

- [ ] **Step 3: Extract the delete dialog**

`apps/web/app/components/delete-event-dialog.tsx` — move the `AlertDialog` markup, the delete mutation, and the styles it uses (`destructiveAction`, `spinner` + its keyframes) out of `app/page.tsx`:

```tsx
"use client";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type EventRecord, eventKeys, eventsApi } from "@/lib/events";
import { colors, typography } from "@/styles/tokens.stylex";

const spin = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
    // copy `destructiveAction` and `spinner` verbatim from app/page.tsx
    error: { color: colors.destructive },
});

/** The one confirmation dialog for deleting an event, used by the list and the detail page. */
export function DeleteEventDialog({
    event,
    onClose,
    onDeleted,
}: {
    event: EventRecord | null;
    onClose: () => void;
    onDeleted?: () => void;
}) {
    const queryClient = useQueryClient();
    const remove = useMutation({
        mutationFn: (id: string) => eventsApi.remove(id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: eventKeys.all });
            onClose();
            onDeleted?.();
        },
    });

    return (
        <AlertDialog
            open={event !== null}
            onOpenChange={(open) => {
                if (!open) {
                    remove.reset();
                    onClose();
                }
            }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{event?.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                {remove.error && (
                    <p role="alert" {...stylex.props(styles.error, typography.sm)}>
                        {remove.error.message}
                    </p>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        style={styles.destructiveAction}
                        disabled={remove.isPending}
                        onClick={() => event && remove.mutate(event.id)}>
                        {remove.isPending && <Loader2Icon {...stylex.props(styles.spinner)} />}
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
```

(Fill in `destructiveAction` and `spinner` by copying them from `app/page.tsx`; keep the `spin` keyframes.)

In `app/page.tsx`:
- remove the `deleteMutation`, `handleDelete`, the `AlertDialog` block, the `AlertDialog*` imports, and styles that are now unused (`destructiveAction`; keep `spinner` if the loading state still uses it);
- `pageError` becomes `listError ? messageOf(listError, "Failed to load events") : null`;
- render `<DeleteEventDialog event={deletingEvent} onClose={() => setDeletingEvent(null)} />` where the old dialog was;
- make the name a link to the detail page — replace `<span {...stylex.props(styles.nameText)}>{event.name}</span>` with:

```tsx
<Link href={`/events/${event.id}`} {...stylex.props(styles.nameText, styles.nameLink)}>
    {event.name}
</Link>
```

and add a `nameLink` style: `{ color: "inherit", textDecoration: { default: "none", ":hover": "underline" } }`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter web test && pnpm --filter web check-types && pnpm --filter web lint`
Expected: PASS, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Add event detail helpers, share the delete dialog, link event names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web — the server-rendered detail page

**Files:**
- Create: `apps/web/app/lib/events.server.ts`
- Create: `apps/web/app/components/local-date-time.tsx`, `apps/web/app/components/event-owner-actions.tsx`
- Create: `apps/web/app/events/[id]/page.tsx`, `apps/web/app/events/[id]/not-found.tsx`
- Modify: `docs/architecture.md` ("Web app routes")

**Interfaces:**
- Consumes: Task 2's helpers, `DeleteEventDialog`, `EventRecord.organizer`; `request`/`ApiError` from `lib/api.ts`; `imageUrl` from `lib/events.ts`; `useMe`, `canModifyEvent` from `lib/auth.ts`.
- Produces: `getEvent(id: string): Promise<EventRecord | null>`.

Read the Next docs named in Global Constraints first.

- [ ] **Step 1: Data access**

`apps/web/app/lib/events.server.ts`:

```ts
import { cache } from "react";

import { ApiError, request } from "./api";
import type { EventRecord } from "./events";

/**
 * Server-side read of a public event. `cache` makes the page and
 * generateMetadata share one request per render. Not cached across requests —
 * edits must show immediately.
 */
export const getEvent = cache(async (id: string) => {
    try {
        return await request<EventRecord>(`/api/events/${encodeURIComponent(id)}`, { cache: "no-store" });
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
    }
});
```

- [ ] **Step 2: Client islands**

`apps/web/app/components/local-date-time.tsx`:

```tsx
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
```

`apps/web/app/components/event-owner-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { DeleteEventDialog } from "@/components/delete-event-dialog";
import { Button, buttonStyleProps } from "@/components/ui/button";
import { canModifyEvent, useMe } from "@/lib/auth";
import type { EventRecord } from "@/lib/events";

const styles = stylex.create({
    actions: { display: "flex", gap: "0.5rem" },
});

/** Edit/Delete for the organizer or an admin. The API enforces this; hiding is UX. */
export function EventOwnerActions({ event }: { event: EventRecord }) {
    const router = useRouter();
    const { data: me } = useMe();
    const [deleting, setDeleting] = useState<EventRecord | null>(null);

    if (!canModifyEvent(me, event)) return null;

    return (
        <div {...stylex.props(styles.actions)}>
            <Link href={`/events/${event.id}/edit`} {...buttonStyleProps("outline", "sm")}>
                <PencilIcon />
                Edit
            </Link>
            <Button variant="outline" size="sm" onClick={() => setDeleting(event)}>
                <Trash2Icon />
                Delete
            </Button>
            <DeleteEventDialog event={deleting} onClose={() => setDeleting(null)} onDeleted={() => router.push("/")} />
        </div>
    );
}
```

- [ ] **Step 3: The page and the 404 UI**

`apps/web/app/events/[id]/page.tsx` (no `"use client"`):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as stylex from "@stylexjs/stylex";

import { EventOwnerActions } from "@/components/event-owner-actions";
import { LocalDateTime } from "@/components/local-date-time";
import { formatAddressLines, osmEmbedUrl, osmLinkUrl } from "@/lib/event-detail";
import { imageUrl } from "@/lib/events";
import { getEvent } from "@/lib/events.server";
import { colors, radius, typography } from "@/styles/tokens.stylex";

type Props = { params: Promise<{ id: string }> };

const DESCRIPTION_LIMIT = 160;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const event = await getEvent((await params).id);
    // Calling notFound() here, before streaming starts, is what guarantees an HTTP 404.
    if (!event) notFound();

    return {
        title: event.name,
        description: event.description?.slice(0, DESCRIPTION_LIMIT) || undefined,
        openGraph: event.imageKey ? { images: [imageUrl(event.imageKey)] } : undefined,
    };
}

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: { default: "1rem", "@media (min-width: 640px)": "1.5rem" },
        paddingBlock: "2.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
    },
    back: { color: colors.mutedForeground, textDecoration: { default: "none", ":hover": "underline" } },
    cover: { width: "100%", maxHeight: "22rem", objectFit: "cover", borderRadius: radius.lg },
    title: { fontSize: "2rem", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.025em" },
    meta: { display: "flex", flexDirection: "column", gap: "0.25rem", color: colors.mutedForeground },
    description: { whiteSpace: "pre-line", lineHeight: 1.6 },
    venue: {
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1.25rem",
        borderRadius: radius.lg,
        backgroundColor: colors.background,
    },
    venueTitle: { fontWeight: 600 },
    address: { fontStyle: "normal", lineHeight: 1.5 },
    map: { width: "100%", height: "18rem", borderWidth: 0, borderRadius: radius.md },
    link: { color: colors.foreground },
});

export default async function EventPage({ params }: Props) {
    const event = await getEvent((await params).id);
    if (!event) notFound();

    const address = event.address;

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <Link href="/" {...stylex.props(styles.back, typography.sm)}>
                    ← All events
                </Link>

                {event.imageKey && (
                    // biome-ignore lint/performance/noImgElement: API-hosted upload; the project serves images as plain <img>
                    <img src={imageUrl(event.imageKey)} alt="" {...stylex.props(styles.cover)} />
                )}

                <h1 {...stylex.props(styles.title)}>{event.name}</h1>

                <div {...stylex.props(styles.meta, typography.sm)}>
                    {event.startsAt ? (
                        <LocalDateTime startsAt={event.startsAt} endsAt={event.endsAt} />
                    ) : (
                        <span>Date to be announced</span>
                    )}
                    <span>
                        {event.organizer?.name ? `Organized by ${event.organizer.name}` : "Organizer unknown"}
                    </span>
                </div>

                <EventOwnerActions event={event} />

                {event.description && <p {...stylex.props(styles.description)}>{event.description}</p>}

                {address && (
                    <section aria-labelledby="venue-title" {...stylex.props(styles.venue)}>
                        <h2 id="venue-title" {...stylex.props(styles.venueTitle)}>
                            Venue
                        </h2>
                        <address {...stylex.props(styles.address)}>
                            {formatAddressLines(address).map((line) => (
                                <div key={line}>{line}</div>
                            ))}
                        </address>
                        {address.lat !== null && address.lon !== null && (
                            <iframe
                                title={`Map of ${address.label ?? address.line1}`}
                                src={osmEmbedUrl(address.lat, address.lon)}
                                loading="lazy"
                                {...stylex.props(styles.map)}
                            />
                        )}
                        <a href={osmLinkUrl(address)} target="_blank" rel="noreferrer" {...stylex.props(styles.link, typography.sm)}>
                            Open in OpenStreetMap
                        </a>
                    </section>
                )}
            </main>
        </div>
    );
}
```

If a token name above doesn't exist in `apps/web/app/styles/tokens.stylex.ts`, use the closest one. If the existing Biome rule name differs, copy the ignore comment from `apps/web/app/components/event-form.tsx`.

`apps/web/app/events/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import * as stylex from "@stylexjs/stylex";

import { colors, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: "1rem",
        paddingBlock: "3.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
    },
    title: { fontSize: "1.875rem", fontWeight: 600 },
    text: { color: colors.mutedForeground },
});

export default function EventNotFound() {
    return (
        <main {...stylex.props(styles.main)}>
            <h1 {...stylex.props(styles.title)}>Event not found</h1>
            <p {...stylex.props(styles.text, typography.sm)}>
                It may have been deleted. <Link href="/">Back to all events</Link>
            </p>
        </main>
    );
}
```

- [ ] **Step 4: Docs**

In `docs/architecture.md` "Web app routes", add after the `/` bullet:

```markdown
- `/events/[id]` — event detail. A Server Component (rendered per request,
  `notFound()` → HTTP 404); only the dates (`LocalDateTime`, viewer's time
  zone) and the owner's Edit/Delete (`EventOwnerActions`) are client islands.
```

and change the sentence about create/edit being "full routes" only if it now reads inaccurately.

- [ ] **Step 5: Verify**

Run: `pnpm --filter web check-types && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`
Expected: PASS; the build output lists `/events/[id]` as dynamic (ƒ).

- [ ] **Step 6: Commit**

```bash
git add apps/web docs/architecture.md
git commit -m "Add the server-rendered event detail page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: E2E — the detail page

**Files:**
- Create: `apps/e2e/tests/event-detail.spec.ts`

**Interfaces:**
- Consumes: `API_URL` from `apps/e2e/tests/support/auth.ts`; the chromium project runs signed in as the e2e user (storageState).

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test";

import { API_URL } from "./support/auth.js";

const VENUE = {
    label: "E2E Hall",
    line1: "Nieuwmarkt 4",
    city: "Amsterdam",
    postalCode: "1012 CR",
    country: "Netherlands",
    lat: 52.3723,
    lon: 4.9002,
};

test.describe("event detail page", () => {
    let eventId: string;
    let name: string;

    test.beforeEach(async ({ request }) => {
        name = `E2E event detail ${Date.now()}`;
        const response = await request.post(`${API_URL}/api/events`, {
            data: { name, description: "Line one\nLine two", startsAt: "2030-05-01T18:00:00.000Z", address: VENUE },
        });
        expect(response.status()).toBe(201);
        eventId = (await response.json()).id;
    });

    test.afterEach(async ({ request }) => {
        await request.delete(`${API_URL}/api/events/${eventId}`);
    });

    test("opens from the list and shows the event", async ({ page }) => {
        await page.goto("/");
        await page.getByRole("link", { name, exact: true }).click();

        await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        await expect(page.getByText(/^Organized by /)).toBeVisible();
        await expect(page.getByText("Nieuwmarkt 4")).toBeVisible();
        await expect(page.locator(`iframe[title="Map of ${VENUE.label}"]`)).toBeVisible();
        await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
    });

    test("is rendered on the server", async ({ request, baseURL }) => {
        const response = await request.get(`${baseURL}/events/${eventId}`);

        expect(response.status()).toBe(200);
        expect(await response.text()).toContain(name);
    });

    test("hides owner actions from signed-out visitors", async ({ browser, baseURL }) => {
        const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const page = await context.newPage();

        await page.goto(`${baseURL}/events/${eventId}`);
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        await expect(page.getByRole("link", { name: "Edit" })).toBeHidden();

        await context.close();
    });
});

test("responds 404 for an unknown event", async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/events/does-not-exist`);

    expect(response.status()).toBe(404);
});
```

(The e2e user's display name is "E2E runner", so "Organized by E2E runner" will show; the regex keeps the test independent of that.) Names start with "E2E event", so the existing sweep in events.spec.ts also catches leftovers.

- [ ] **Step 2: Run**

Postgres is up; ports 3000/4000 must be free (Playwright boots both apps).
Run: `pnpm test:e2e`
Expected: all specs PASS, including `event-detail.spec.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/e2e/tests/event-detail.spec.ts
git commit -m "Cover the event detail page end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
