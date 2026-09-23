# Event create & edit — frontend design

Date: 2026-09-22
Status: approved, not yet implemented

## Problem

The API contract moved ahead of the UI. `apps/web` still submits only `{ name }`,
so creating an event returns 400 and the E2E spec covering it is `test.fixme`d.
The web `Event` type is stale, and the edit dialog cannot reach description,
dates, image or venue.

This spec covers creating and editing events from the web app.

## Decisions

| Question | Decision |
| --- | --- |
| Where does creating happen? | Dedicated routes, one form per page |
| Scope | Create **and** edit, sharing one form |
| Venue input | Plain structured inputs now; geo autocomplete later |
| Venue relation | Optional 1:1 (`Event.addressId` is `@unique`) |
| Image upload timing | On submit, not on file select |
| Validation | Shared Zod contract package |
| Date control | ~~Registry Date Picker + Calendar~~ — see **Deviations from this spec** |
| Form library | TanStack Form |

## Architecture

### `@repo/contracts` (new package)

Zod schemas become the single source of truth for both apps. The server wants
`Date` objects while a browser form works in strings, so the package exports
both, derived from one field shape so they cannot drift:

```ts
const eventFields = {
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullish(),
  addressId: z.string().min(1).nullish(),
  imageKey: imageKeySchema.nullish(),
  startsAt: z.iso.datetime({ offset: true }).nullish(), // wire format
  endsAt: z.iso.datetime({ offset: true }).nullish(),
};

export const createEventInput = z.object(eventFields);        // web / form
export const createEventPayload = createEventInput.extend({   // API
  startsAt: dateFromIso.nullish(),
  endsAt: dateFromIso.nullish(),
});
```

`zod` moves into this package; both apps get it transitively. The API's
`event.schema.ts` and `address.schema.ts` become thin re-exports so the
four-file module layering in `docs/architecture.md` is preserved.

### Routes

| Route | Purpose |
| --- | --- |
| `/` | List. The edit dialog is **removed**; rows link to edit. |
| `/events/new` | Create |
| `/events/[id]/edit` | Edit, prefilled from a detail query |

Both are client components rendering one shared `EventForm`, differing only in
initial values and which mutation runs. Both redirect to `/` on success.

### New vendored components

~~`date-picker`, `calendar`, `textarea` from the stylexui registry, added with the
shadcn CLI as described in `docs/css-conventions.md`.~~ — see **Deviations from
this spec**: the registry ships no `date-picker`, so only `calendar` and
`textarea` were vendored; the date-time control is hand-composed.

## The form

Form state is deliberately **not** the API payload. It holds what the user
manipulates; a mapping step at submit turns it into requests:

```
name, description, startsAt, endsAt
imageFile: File | null, existingImageKey
venue: { line1, line2, city, region, postalCode, country } | null
```

### Submit sequence

Worst case three requests, in order:

1. `imageFile` changed → `uploadImage(file)` → `imageKey`
2. venue section in use → `/api/addresses`, then link the returned id:
   - event has no `addressId` yet → `POST` a new address
   - event already has one → `PATCH` it in place (safe: the relation is 1:1)
   - venue section cleared → skip this step and send `addressId: null`
3. `POST` / `PATCH` the event with the resolved keys

`uploadImage` stays a single function in `apps/web/app/lib/events.ts` so the
local-disk → S3 switch touches one place and the form never knows.

### Fields

| Field | Control | Notes |
| --- | --- | --- |
| name | Input | Required — the only required field |
| description | Textarea | Max 2000 |
| startsAt / endsAt | Date Picker | Converted to ISO-with-offset at the boundary |
| image | File input | Local `URL.createObjectURL` preview; no upload until submit |
| venue | Collapsed section | Expands to six postal inputs |

### Venue behaviour

Because the relation is 1:1, an address belongs to exactly one event, so editing
venue fields in place is safe — no other event can reference it. Clearing the
fields detaches the venue (`addressId: null`).

The venue is optional as a whole, but **not partially**: `line1`, `city` and
`country` are `NOT NULL` in the database. So the section is either left empty
(no address written) or filled with at least those three. The form enforces
this — touching any venue field makes the three required, and clearing them all
returns the section to "unused" rather than leaving a half-filled address.

### Validation

Client-side against `createEventInput` plus the `endsAt > startsAt` comparison.
The server stays authoritative: its 400s render as field errors. The shared
schema is a UX improvement, not the security boundary.

### Edit

Prefills from `GET /api/events/:id`. ~~PATCHes only dirty fields, which is the
main thing the form library buys us.~~ — see **Deviations from this spec**: the
form always sends the full input; dirty-field diffing was cut before
execution.

## Data flow

`eventKeys` gains `detail(id)`. Create and update are mutations that invalidate
the list (and detail) then redirect. Address calls stay plain functions inside
the submit sequence — there is no address UI to cache yet, so they get no query
keys.

## Error handling

- Server 400 `issues[]` map onto fields by `path`
- ~~404 on the edit route renders `notFound()`~~ — see **Deviations from this
  spec**: it renders an inline error instead.
- Network and unknown failures show a form-level banner

### Known limitation: partial failure

The submit sequence is up to three sequential HTTP calls with no transaction
across them.

On **create**: if the image uploads and the address is created but the event
write fails, an orphaned image and an orphaned address are left behind.

On **edit**: `resolveAddressId` PATCHes the *existing* Address in place before
`eventsApi.update` runs. If the event write then fails, the user's venue edit
has already been committed — this is destructive in-place mutation of
existing data, not just a leftover row like the create case. There is no undo;
the only trace is the form's own error banner telling the user the save
failed, with no indication that the venue portion actually went through.

For this spec that is **accepted**: the error surfaces clearly and the form
keeps its state so the user can retry.

**Follow-up work (not in this spec):**

1. Orphaned images — handle with the S3 migration via a lifecycle rule expiring
   unreferenced objects under a `tmp/` prefix. Local disk has no reaper today.
2. Orphaned addresses — either a compound `POST /api/events` accepting a nested
   address so the server writes both in one transaction, or a periodic sweep
   deleting addresses with no event.
3. Detaching a venue also orphans its address row; the same sweep covers it.
4. The edit-time Address PATCH-before-event-write ordering above: making the
   whole submit sequence transactional (or reordering so the event write is
   attempted first) would remove the risk of a committed venue edit alongside
   a failed event save.

## Deviations from this spec

Decided and reviewed during execution; recorded here because the sections
above still describe the original intent, not what shipped.

- **PATCH sends the full input, not just dirty fields.** Diffing was cut
  before execution: the venue relation is 1:1, there is a single editor, and
  there is no clobbering risk to guard against, so the extra bookkeeping
  wasn't worth it.
- **The edit route's 404 renders inline, not via `notFound()`.** The edit page
  is a client component whose data (`GET /api/events/:id`) arrives after the
  initial render — the shell has already painted by the time the fetch
  resolves. Calling `notFound()` at that point would replace an
  already-visible page rather than prevent one from rendering, which is a
  worse experience than an inline error inside the existing shell.
- **No `date-picker` was vendored; there is no registry date picker to
  vendor.** The stylexui registry does not ship one. The date-time control is
  hand-composed from the vendored `Popover` and `Calendar` plus a plain time
  `<input>`, wired together in `apps/web/app/components/date-time-picker.tsx`.

## Testing

Following `docs/testing-conventions.md`:

- **Unit (Vitest)** for the pure mapping logic: form values → API payload, local
  datetime ↔ ISO-with-offset, and the dirty-diff for PATCH. The timezone
  conversion is exactly the kind of thing that breaks quietly.
- **E2E (Playwright)**: un-`fixme` the existing spec and extend it — create with
  every field including venue and an image fixture, then edit, then delete.
- **No component tests**, consistent with the existing convention: jsdom plus the
  StyleX babel transform plus a Query provider is not worth it for one form.

## Out of scope

- Geo-service venue autocomplete (service not yet chosen)
- Venue management screen
- Orphan cleanup (see follow-ups above)
- Image cropping or resizing
