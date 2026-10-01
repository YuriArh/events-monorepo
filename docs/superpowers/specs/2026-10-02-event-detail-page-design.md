# Event detail page design

**Date:** 2026-10-02
**Status:** Draft, awaiting review

## Goal

Clicking an event in the list opens `/events/[id]`, a detail page showing
everything known about the event: cover image, name, when, organizer,
description, and the venue with a map.

The page follows the project principles in `AGENTS.md`: KISS, DRY, and
server rendering first — the page is a Server Component; only the parts that
need the browser are client islands.

## Decisions

| Question | Decision |
| --- | --- |
| Rendering | Server Component, rendered per request (no caching) |
| Navigation from the list | The event name becomes a `next/link`; the row itself is not clickable |
| Organizer | Shown by name; API adds `organizer: { id, name } \| null`, never the email |
| Map | OpenStreetMap embed `<iframe>` with a marker, plus an "Open in OpenStreetMap" link |
| Owner controls (Edit/Delete) | Client island using `useMe()` + `canModifyEvent` |
| Dates | Client island `LocalDateTime` — formatted in the viewer's time zone |
| Missing event | `notFound()` → real HTTP 404 and a not-found page |
| Metadata | `generateMetadata`: title, description, Open Graph image |

## Why these islands, and only these

- **Owner controls** need the viewer's session. The session cookie belongs to
  the API's host; in production (`app.example.com` + `api.example.com`) the Next
  server doesn't receive it. Reading it server-side would need a cookie
  `Domain` change and an extra API call per render. The island reuses the
  existing `useMe()` and costs nothing extra.
- **Dates** have no stored time zone, and the server doesn't know the
  viewer's. Formatting on the server would show server-local time. The server
  renders a `<time dateTime="…">` with a UTC fallback text; the island
  re-formats it in the viewer's zone after hydration.

Everything else — cover, name, organizer, description, address, map, links,
metadata — is server-rendered HTML.

## API

`event.repository.ts`: the shared `include` used by `findMany`, `findById`,
`create` and `update` gains the organizer's public fields:

```ts
const withRelations = {
  address: true,
  organizer: { select: { id: true, name: true } },
} as const;
```

So every event response carries `organizer: { id, name } | null` (null for
ownerless events). `organizerId` stays — `canModifyEvent` keeps using it.
The organizer's email is never selected.

## Web

### Data access — `apps/web/app/lib/events.server.ts`

```ts
import { cache } from "react";

/** One fetch per request, shared by the page and generateMetadata. */
export const getEvent = cache(async (id: string) => {
  try {
    return await request<EventRecord>(`/api/events/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});
```

Reuses `request()`, `ApiError`, `EventRecord` and `API_URL` — no second HTTP
client and no new environment variable. The event endpoint is public, so no
cookie is forwarded.

`EventRecord` (in `lib/events.ts`) gains
`organizer: { id: string; name: string | null } | null`.

### Page — `apps/web/app/events/[id]/page.tsx` (Server Component)

- `const { id } = await params; const event = await getEvent(id); if (!event) notFound();`
- `generateMetadata` uses the same `getEvent` (deduplicated by `cache`):
  `title: event.name`, `description`: description trimmed to ~160 chars,
  `openGraph.images`: `imageUrl(event.imageKey)` when present. Missing event →
  `{ title: "Event not found" }`.
- Layout, top to bottom:
  1. "← All events" link.
  2. Cover image (plain `<img>`, like the existing preview; `alt=""` — the
     name is the heading).
  3. `<h1>` name.
  4. When: `<LocalDateTime startsAt endsAt />`; "Date to be announced" when
     `startsAt` is null (server-rendered, no island needed).
  5. "Organized by {name}", or "Organizer unknown" when there is no organizer
     or no name. Never the email.
  6. `<EventOwnerActions event={…} />` island.
  7. Description, preserving line breaks (`white-space: pre-line`); omitted
     when empty.
  8. Venue card (omitted when there is no address): address lines, then the
     map `<iframe>` when `lat`/`lon` exist (`title="Map of {venue}"`,
     `loading="lazy"`), and the "Open in OpenStreetMap" link (a coordinate
     link when `lat`/`lon` exist, an address search link otherwise).

### Not found — `apps/web/app/events/[id]/not-found.tsx`

"Event not found" and a link back to the list.

### Client islands

- `components/local-date-time.tsx` — `"use client"`; renders
  `<time dateTime={startsAt}>` with the UTC fallback text, and replaces it with
  `formatEventWhen(startsAt, endsAt, timeZone)` in the viewer's zone after
  mount (`useEffect`), avoiding a hydration mismatch.
- `components/event-owner-actions.tsx` — `"use client"`; `useMe()` +
  `canModifyEvent`; renders the Edit link and a Delete button that opens
  `DeleteEventDialog`. On success: invalidate `eventKeys.all`,
  `router.push("/")`.
- `components/delete-event-dialog.tsx` — the confirmation dialog extracted
  from `app/page.tsx` so the list and the detail page share it (DRY). Props:
  `event`, `open`, `onOpenChange`, `onDeleted`; owns the delete mutation and
  its error text.

### Pure helpers — `apps/web/app/lib/event-detail.ts` (unit-tested)

- `formatEventWhen(startsAt, endsAt, timeZone?)` — e.g.
  "Thu, Oct 1, 2026 · 18:00 – 21:00"; a different end day prints both dates;
  no end prints only the start.
- `formatAddressLines(address)` — label, line1, line2, "postalCode city",
  region, country; empty parts dropped.
- `osmEmbedUrl(lat, lon)` — `https://www.openstreetmap.org/export/embed.html`
  with a `bbox` of ±0.005° around the point and `marker=lat,lon`.
- `osmLinkUrl(address)` — `https://www.openstreetmap.org/?mlat=…&mlon=…#map=17/…`
  with coordinates, otherwise `https://www.openstreetmap.org/search?query=…`.

### List — `apps/web/app/page.tsx`

The event name becomes `<Link href={`/events/${event.id}`}>`. The inline
delete dialog is replaced by `DeleteEventDialog`. The list stays a client
page in this change.

## Error handling

- Unknown id → API 404 → `getEvent` returns `null` → `notFound()` → HTTP 404.
- API down / 5xx → `getEvent` throws → Next's error boundary (500). No custom
  error page in this change.
- Old addresses without coordinates → no map, address search link instead.

## Testing

- **API** (`event.routes.test.ts`): `GET /api/events/:id` and the list include
  `organizer: { id, name }` for an event created by a signed-up user, and the
  response body does not contain the organizer's email.
- **Web unit** (`lib/event-detail.test.ts`): `formatEventWhen` (same day,
  different days, no end; fixed `timeZone` for determinism),
  `formatAddressLines`, `osmEmbedUrl`, `osmLinkUrl` (with and without
  coordinates).
- **E2E** (`apps/e2e/tests/event-detail.spec.ts`), signed in as the e2e user:
  - create an event with a venue, click its name in the list → URL is
    `/events/{id}`; name, "Organized by", venue lines and the map iframe are
    visible; Edit is visible for the owner;
  - the server-rendered HTML (`request.get("/events/{id}")`) already contains
    the event name — proof of SSR;
  - `/events/does-not-exist` responds 404;
  - signed out, the same page renders without Edit/Delete.
  Clean up the created event.

## Out of scope

- Server-rendering the event list.
- Add-to-calendar (.ics), sharing.
- Custom error page for API failures.
- Showing organizer avatars/profiles.
