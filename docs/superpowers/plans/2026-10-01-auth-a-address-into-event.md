# Auth plan A — Fold the address into the event

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an event's venue part of the event payload so it has no endpoints or access rules of its own, removing `/api/addresses` entirely.

**Architecture:** The event create/update contracts replace `addressId` with a nested `address` object. The event repository writes the venue with Prisma nested writes (`create` / `upsert` / `delete`), so event and venue change in one statement, and event deletion deletes its venue in the same transaction. The `addresses` API module, `addressesApi` and `resolveAddressId` are deleted.

**Tech Stack:** Fastify 5, Prisma 7 (Postgres), Zod 4 (`@repo/contracts`), Next.js 16 + TanStack Query/Form, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-auth-design.md`, section "Changes to existing modules → Addresses — folded into events". This is plan A of three (A → B → C). No auth in this plan: it is a pure refactor.

## Global Constraints

- No schema change. `Event.addressId` stays `@unique`, FK on `Event`, `onDelete: SetNull`.
- `packages/contracts/src/index.ts` stays a single file with no relative imports.
- Styling is StyleX only; never hand-edit `apps/web/app/components/ui/**`.
- API layering: routes → service → repository; only repositories call Prisma.
- Every task ends with `pnpm check-types && pnpm lint && pnpm test` green (Postgres up: `docker compose up -d`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Deviation from spec (record in spec when done, Task 4):** the spec says `address.repository.ts` stays. Nested writes make it unused, so the whole `addresses` module is deleted and the `Prisma.DbNull` helper moves into `event.repository.ts`.

---

## File map

| File | Change |
| --- | --- |
| `packages/contracts/src/index.ts` | `eventFields.addressId` → `address`; drop `addressParamsSchema`, `updateAddressInput` |
| `apps/api/src/modules/events/event.repository.ts` | Nested venue writes; transactional delete |
| `apps/api/src/modules/events/event.service.ts` | Drop address assertions and errors |
| `apps/api/src/modules/events/event.routes.ts` | Drop mapping of removed errors |
| `apps/api/src/modules/events/event.routes.test.ts` | Venue cases (moved from address tests) |
| `apps/api/src/modules/addresses/**` | Delete |
| `apps/api/src/app.ts` | Unregister `addressRoutes` |
| `apps/web/app/lib/events.ts` | Delete `addressesApi` |
| `apps/web/app/lib/event-form.ts` | `toEventInput` embeds `address`; delete `resolveAddressId` |
| `apps/web/app/lib/event-form.test.ts` | Follow the above |
| `apps/web/app/components/event-form.tsx` | New `toEventInput` signature; comments |
| `apps/web/app/events/new/page.tsx`, `apps/web/app/events/[id]/edit/page.tsx` | Drop address step |
| `apps/e2e/tests/events.spec.ts` | Drop address cleanup |
| `docs/architecture.md`, `docs/testing-conventions.md`, the spec | Docs |

---

### Task 1: API — venue travels inside the event

**Files:**
- Modify: `packages/contracts/src/index.ts:10-81`
- Modify: `apps/api/src/modules/events/event.repository.ts`
- Modify: `apps/api/src/modules/events/event.service.ts`
- Modify: `apps/api/src/modules/events/event.routes.ts:20-43`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/events/event.routes.test.ts`
- Delete: `apps/api/src/modules/addresses/` (all six files)

**Interfaces:**
- Produces: `createEventInput` / `createEventPayload` with `address?: CreateAddressInput | null` and no `addressId`. Update variants are `.partial()`: `address` omitted = unchanged, `null` = delete venue, object = create or update in place.
- Produces: `eventRepository.create(data)`, `.update(id, data)`, `.delete(id)` (now transactional, deletes the venue).
- Response shape unchanged: event JSON still carries `addressId` and embedded `address`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/modules/events/event.routes.test.ts`, add `prisma` to the imports and a `VENUE` constant after `ENDS_AT`:

```ts
import { prisma } from "@repo/db";
```

```ts
const VENUE = {
    label: "Town Hall",
    line1: "1 Civic Square",
    city: "Amsterdam",
    country: "NL",
};
```

Change `addressId: string | null;` in `EventPayload` to:

```ts
    addressId: string | null;
    address: { id: string; label: string | null; city: string } | null;
```

Append at the end of the file:

```ts
describe("event venue", () => {
    it("creates the venue with the event", async () => {
        const created = await createEvent({ address: VENUE });

        expect(created.address).toMatchObject({ label: "Town Hall", city: "Amsterdam" });
        expect(created.addressId).toBe(created.address?.id);
    });

    it("updates the venue in place", async () => {
        const created = await createEvent({ address: VENUE });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { address: { ...VENUE, city: "Rotterdam" } },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            addressId: created.addressId,
            address: { id: created.addressId, city: "Rotterdam" },
        });
        expect(await prisma.address.count()).toBe(1);
    });

    it("adds a venue to an event that had none", async () => {
        const created = await createEvent();

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { address: VENUE },
        });

        expect(response.json()).toMatchObject({ address: { city: "Amsterdam" } });
    });

    it("keeps the venue when address is omitted", async () => {
        const created = await createEvent({ address: VENUE });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { name: "Renamed" },
        });

        expect(response.json()).toMatchObject({ addressId: created.addressId });
    });

    it("deletes the venue row when address is null", async () => {
        const created = await createEvent({ address: VENUE });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/events/${created.id}`,
            headers: { "content-type": "application/json" },
            payload: { address: null },
        });

        expect(response.json()).toMatchObject({ addressId: null, address: null });
        expect(await prisma.address.count()).toBe(0);
    });

    // Addresses no longer outlive their event; before this, the e2e suite had
    // to clean up orphans by hand.
    it("deletes the venue with the event", async () => {
        const created = await createEvent({ address: VENUE });

        await app.inject({ method: "DELETE", url: `/api/events/${created.id}` });

        expect(await prisma.address.count()).toBe(0);
    });

    it("round-trips coordinates and the raw feature", async () => {
        const raw = { type: "Feature", properties: { osm_id: 123456 } };

        const created = await createEvent({
            address: { ...VENUE, lat: 52.3723, lon: 4.9002, osmId: "W123456", raw },
        });

        expect(created.address).toMatchObject({ lat: 52.3723, osmId: "W123456", raw });
    });

    // Prisma needs DbNull rather than null for a nullable Json column.
    it("stores a venue with no geocoding fields", async () => {
        const created = await createEvent({ address: VENUE });

        expect(created.address).toMatchObject({ lat: null, lon: null, osmId: null, raw: null });
    });

    it.each([
        ["a missing line1", { line1: undefined }],
        ["a missing city", { city: undefined }],
        ["a missing country", { country: undefined }],
    ])("rejects a venue with %s, reporting the nested path", async (_label, overrides) => {
        const response = await app.inject({
            method: "POST",
            url: "/api/events",
            headers: { "content-type": "application/json" },
            payload: { name: "Valid", address: { ...VENUE, ...overrides } },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().issues[0].path[0]).toBe("address");
    });

    it("no longer exposes /api/addresses", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/addresses",
            headers: { "content-type": "application/json" },
            payload: VENUE,
        });

        expect(response.statusCode).toBe(404);
    });
});
```

Also fix the `EventPayload` type and `createEvent` return to include the `address` field (done above). In the test `"defaults the optional fields to null"` the expectation `addressId: null` stays valid.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api test`
Expected: the new `event venue` cases FAIL (`address` is stripped by the current schema, so `created.address` is `null`; `/api/addresses` returns 201, not 404).

- [ ] **Step 3: Change the contract**

In `packages/contracts/src/index.ts`, replace the addresses section (lines 10–36) with:

```ts
// ---------------------------------------------------------------- addresses

/**
 * An event's venue. It has no endpoints of its own: it is written only as the
 * `address` field of an event payload. line1, city and country are NOT NULL
 * in the database.
 */
export const createAddressInput = z.object({
  label: z.string().max(255).nullish(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).nullish(),
  city: z.string().min(1).max(255),
  region: z.string().max(255).nullish(),
  postalCode: z.string().max(32).nullish(),
  country: z.string().min(1).max(255),
  // Populated from a Photon result; null for addresses created before
  // geocoding existed, which is why every one of these is optional.
  lat: z.number().min(-90).max(90).nullish(),
  lon: z.number().min(-180).max(180).nullish(),
  osmId: z.string().max(64).nullish(),
  raw: z.unknown().optional(),
});

export type CreateAddressInput = z.infer<typeof createAddressInput>;
```

In `eventFields`, replace the `addressId` entry:

```ts
  /**
   * The venue, written with the event. On update: omitted leaves it as is,
   * null deletes it, an object creates it or updates it in place.
   */
  address: createAddressInput.nullish(),
```

- [ ] **Step 4: Rewrite the event repository**

Replace `apps/api/src/modules/events/event.repository.ts` with:

```ts
import { Prisma, prisma } from "@repo/db";

import type { CreateAddressInput, CreateEventInput, UpdateEventInput } from "./event.types.js";

const withAddress = { address: true } as const;

/**
 * Prisma cannot tell "SQL NULL" from "the JSON value null" on a nullable Json
 * column, so it refuses a bare `null` and wants `Prisma.DbNull` instead.
 */
const toAddressData = (address: CreateAddressInput) => ({
  ...address,
  raw:
    address.raw === undefined || address.raw === null
      ? Prisma.DbNull
      : (address.raw as Prisma.InputJsonValue),
});

/**
 * The venue is part of the event: `undefined` leaves it alone, `null` deletes
 * the row, an object creates it or updates the existing one in place.
 */
const venueWrite = (address: CreateAddressInput | null | undefined, hasVenue: boolean) => {
  if (address === undefined) return undefined;
  if (address === null) return hasVenue ? { delete: true } : undefined;

  const data = toAddressData(address);
  return { upsert: { create: data, update: data } };
};

export const eventRepository = {
  findMany() {
    return prisma.event.findMany({ orderBy: { startsAt: "asc" }, include: withAddress });
  },

  findById(id: string) {
    return prisma.event.findUnique({ where: { id }, include: withAddress });
  },

  create({ address, ...data }: CreateEventInput) {
    return prisma.event.create({
      data: { ...data, address: address ? { create: toAddressData(address) } : undefined },
      include: withAddress,
    });
  },

  update(id: string, { address, ...data }: UpdateEventInput, hasVenue: boolean) {
    return prisma.event.update({
      where: { id },
      data: { ...data, address: venueWrite(address, hasVenue) },
      include: withAddress,
    });
  },

  /** The venue belongs to the event, so it goes with it. */
  delete(id: string, addressId: string | null) {
    return prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id } });

      if (addressId) {
        await tx.address.delete({ where: { id: addressId } });
      }
    });
  },
};
```

In `apps/api/src/modules/events/event.types.ts`, add the address type export (append):

```ts
export type { CreateAddressInput } from "@repo/contracts";
```

- [ ] **Step 5: Simplify the event service**

In `apps/api/src/modules/events/event.service.ts`:

Delete the import on line 2 (`addressRepository`), the classes `UnknownAddressError` and `AddressAlreadyLinkedError`, and the functions `assertAddressExists` and `assertAddressFree` (lines 13–27 and 36–56).

Replace `create`, `update` and `remove` with:

```ts
  async create(input: CreateEventInput) {
    assertDateRange(input.startsAt, input.endsAt);

    return eventRepository.create(input);
  },

  async update(id: string, input: UpdateEventInput) {
    const existing = await this.getById(id);

    // Checked against the merged result: a payload carrying only one of the two
    // dates can still be invalid once combined with what is already stored.
    assertDateRange(merge(input.startsAt, existing.startsAt), merge(input.endsAt, existing.endsAt));

    const updated = await eventRepository.update(id, input, existing.addressId !== null);

    if (
      input.imageKey !== undefined &&
      existing.imageKey &&
      existing.imageKey !== input.imageKey
    ) {
      await deleteUpload(existing.imageKey);
    }

    return updated;
  },

  async remove(id: string) {
    const existing = await this.getById(id);

    await eventRepository.delete(id, existing.addressId);
    await deleteUpload(existing.imageKey);
  },
```

- [ ] **Step 6: Drop the removed errors from routes, unregister addresses**

In `apps/api/src/modules/events/event.routes.ts`, change the service import and `replyForDomainError`:

```ts
import {
  EventNotFoundError,
  InvalidEventDateRangeError,
  eventService,
} from "./event.service.js";

/** Domain errors carry no HTTP knowledge, so routes map them here. */
const replyForDomainError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof EventNotFoundError) {
    return reply.status(404).send({ message: error.message });
  }

  if (error instanceof InvalidEventDateRangeError) {
    return reply.status(400).send({ message: error.message });
  }

  throw error;
};
```

In `apps/api/src/app.ts`, delete the `addressRoutes` import and the line `app.register(addressRoutes, { prefix: "/api/addresses" });`.

Delete the module:

```bash
git rm -r apps/api/src/modules/addresses
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @repo/contracts check-types; pnpm --filter api check-types && pnpm --filter api test`
Expected: all API tests PASS, including the `event venue` block. (`@repo/contracts` may have no `check-types` script; ignore that line's "missing script" error.)

- [ ] **Step 8: Commit**

```bash
git add -A packages/contracts apps/api
git commit -m "Write an event's venue through the event payload

Removes the standalone /api/addresses routes: an address only exists as
an event's venue, so it is created, updated and deleted with its event.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Web — send the venue with the event

**Files:**
- Modify: `apps/web/app/lib/event-form.ts:85-183`
- Modify: `apps/web/app/lib/event-form.test.ts`
- Modify: `apps/web/app/lib/events.ts:1-64`
- Modify: `apps/web/app/components/event-form.tsx:25-35,130-160`
- Modify: `apps/web/app/events/new/page.tsx`
- Modify: `apps/web/app/events/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `CreateEventInput` from Task 1 (`address?: CreateAddressInput | null`).
- Produces: `toEventInput(values: EventFormValues, resolved: { imageKey: string | null }): CreateEventInput`, which always sets `address` (object or `null`).

- [ ] **Step 1: Update the unit tests first**

In `apps/web/app/lib/event-form.test.ts`:

Remove `resolveAddressId` from the import list.

Replace the `describe("toEventInput", ...)` block with:

```ts
describe("toEventInput", () => {
    it("serialises dates back to ISO with an offset", () => {
        const input = toEventInput(toFormValues(record), { imageKey: null });

        expect(input.startsAt).toBe("2026-10-01T18:00:00.000Z");
    });

    it("passes through the resolved image key", () => {
        const input = toEventInput(emptyFormValues(), { imageKey: "x.png" });

        expect(input).toMatchObject({ imageKey: "x.png" });
    });

    it("embeds the selected venue", () => {
        const input = toEventInput({ ...emptyFormValues(), address: SUGGESTION }, { imageKey: null });

        expect(input.address).toEqual(toAddressInput(SUGGESTION));
    });

    // On an edit, null is what tells the API to delete the venue.
    it("sends null when no venue is selected", () => {
        const input = toEventInput(emptyFormValues(), { imageKey: null });

        expect(input.address).toBeNull();
    });

    it("sends empty text as null rather than an empty string", () => {
        const input = toEventInput({ ...emptyFormValues(), name: "Only a name" }, { imageKey: null });

        expect(input.description).toBeNull();
    });

    it("produces a payload the contract accepts", () => {
        const input = toEventInput(
            { ...emptyFormValues(), name: "Valid", address: SUGGESTION },
            { imageKey: null },
        );

        expect(createEventInput.safeParse(input).success).toBe(true);
    });
});
```

Delete the whole `describe("resolveAddressId with a selected address", ...)` block.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test`
Expected: FAIL — `embeds the selected venue` (`input.address` is `undefined`) and `sends null when no venue is selected`.

- [ ] **Step 3: Implement**

In `apps/web/app/lib/event-form.ts`, replace `toEventInput` (and its comment, lines 85–101) with:

```ts
/**
 * `imageKey` is resolved by the upload step before this runs, which is why it
 * is passed in rather than read off the form. The venue is embedded: null on
 * an edit tells the API to delete it.
 */
export const toEventInput = (
    values: EventFormValues,
    resolved: { imageKey: string | null },
): CreateEventInput => ({
    name: values.name.trim(),
    description: orNull(values.description),
    // toISOString always emits a "Z" offset, which satisfies the contract's
    // `datetime({ offset: true })` rule.
    startsAt: values.startsAt ? values.startsAt.toISOString() : null,
    endsAt: values.endsAt ? values.endsAt.toISOString() : null,
    imageKey: resolved.imageKey,
    address: values.address ? toAddressInput(values.address) : null,
});
```

Move `toAddressInput` above `toEventInput` (it is a `const`, so it must be defined before use at call time — it is only called inside the function body, so order is not strictly required, but keep it above for readability).

Delete the `AddressCalls` type and `resolveAddressId` (lines 138–183). Remove the now-unused `ApiError` import if nothing else in the file uses it (it doesn't): the first import becomes

```ts
import type { CreateAddressInput, CreateEventInput } from "@repo/contracts";

import type { EventRecord } from "./events";
import type { AddressSelection } from "./geocode";
```

In `apps/web/app/lib/events.ts`: change the contracts import to

```ts
import type { CreateEventInput, UpdateEventInput } from "@repo/contracts";
```

and delete the `addressesApi` export (lines 59–64).

In `apps/web/app/components/event-form.tsx`:
- Replace the comment above `isInlineField` (lines 25–33) with:

```ts
/**
 * The venue is nested in the event payload, so the server reports its errors
 * at paths like "address.city" — never the bare "address" that
 * `INLINE_FIELDS` lists. This is the one shared check both `bannerMessage`
 * and the address field's inline renderer use, so "address" only has to mean
 * "starts with address" in one place.
 */
```

- Change the client-side parse call to `toEventInput(value, { imageKey: null })`.
- Replace the comment inside the `catch` that mentions `resolveAddressId` with:

```ts
                    // Venue issues arrive as "address.<field>" because the
                    // venue is nested in the payload, so `fields` keys line up
                    // with the inline renderers below. The banner is then only
                    // for whatever, if anything, still has no inline renderer.
```

In `apps/web/app/events/new/page.tsx`: import list becomes

```ts
import { emptyFormValues, resolveImageKey, toEventInput, type EventFormValues } from "@/lib/event-form";
import { eventKeys, eventsApi, uploadImage } from "@/lib/events";
```

and the `mutationFn` becomes

```ts
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);

            return eventsApi.create(toEventInput(values, { imageKey }));
        },
```

In `apps/web/app/events/[id]/edit/page.tsx`: import list becomes

```ts
import { resolveImageKey, toEventInput, toFormValues, type EventFormValues } from "@/lib/event-form";
import { eventKeys, eventsApi, uploadImage } from "@/lib/events";
```

and the `mutationFn` becomes

```ts
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);

            return eventsApi.update(id, toEventInput(values, { imageKey }));
        },
```

- [ ] **Step 4: Run tests and type checks**

Run: `pnpm --filter web test && pnpm --filter web check-types && pnpm --filter web lint`
Expected: PASS, no type errors (a leftover `addressId:` or `addressesApi` reference would fail `check-types`).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Send the venue inside the event payload from the web form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: E2E — drop the orphan-address cleanup

**Files:**
- Modify: `apps/e2e/tests/events.spec.ts`

- [ ] **Step 1: Simplify the sweep**

Replace `sweepLeftoverEvents` (and keep its doc comment, minus nothing) body with:

```ts
async function sweepLeftoverEvents(request: APIRequestContext) {
    const response = await request.get(`${API_URL}/api/events`);
    const events: Array<{ id: string; name: string }> = await response.json();

    // Deleting an event deletes its venue too, so there is nothing else to clean.
    for (const event of events.filter((candidate) => candidate.name.startsWith("E2E event"))) {
        await request.delete(`${API_URL}/api/events/${event.id}`);
    }
}
```

- [ ] **Step 2: Remove the address bookkeeping from the main test**

In `"creates an event with every field, then edits and deletes it"`:
- delete the comment block and code that captures `createdEvents` / `addressId` (from `// Capture the address id` through `const addressId = ...;`);
- delete the trailing comment and `if (addressId !== null) { ... }` block at the end of the test;
- the `request` fixture is now unused in that test: change the signature to `async ({ page }) =>`.

In `"keeps the event saveable when address lookup is down"`, replace the cleanup tail with:

```ts
    const events: Array<{ id: string; name: string }> = await (
        await request.get(`${API_URL}/api/events`)
    ).json();
    const created = events.find((candidate) => candidate.name === name);
    if (created) {
        await request.delete(`${API_URL}/api/events/${created.id}`);
    }
```

- [ ] **Step 3: Add a venue-deletion check to the delete step**

The venue's lifetime is now the event's. Strengthen the main test: before `test.step("delete", ...)`, capture the event id:

```ts
    const listed: Array<{ id: string; name: string; addressId: string | null }> =
        await (await page.request.get(`${API_URL}/api/events`)).json();
    const createdEvent = listed.find((candidate) => candidate.name === renamed);
    expect(createdEvent?.addressId).not.toBeNull();
```

(No API exposes addresses any more, so the integration test in Task 1 — `deletes the venue with the event` — is what proves the row is gone; this assertion only proves the UI flow created a venue.)

- [ ] **Step 4: Run e2e**

Run: `docker compose up -d && pnpm test:e2e`
Expected: all specs PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e
git commit -m "Drop orphan-address cleanup from e2e; venues die with their event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/testing-conventions.md`
- Modify: `docs/superpowers/specs/2026-10-01-auth-design.md`

- [ ] **Step 1: architecture.md**

- In "Web app routes", change the edit bullet to: "`/events/[id]/edit` — edit form, including the venue, which is sent inside the event payload."
- In "API module layering", change `Modules: \`events/\`, \`addresses/\`, \`geocoding/\`.` to `Modules: \`events/\`, \`geocoding/\`.`
- In "Shared contracts", replace the sentence beginning "Addresses have no date fields" with: "The venue has no endpoint of its own: `createAddressInput` is used only as the nested `address` field of the event schemas."
- Add a paragraph to the end of "Shared contracts":

```markdown
An event's venue (`Address`) is part of the event. It is created, updated and
deleted only through the event endpoints — `address` omitted leaves it alone,
`null` deletes it, an object creates or updates it — and deleting an event
deletes its venue. There is no `/api/addresses`. This keeps access control in
one place: whoever may change the event may change its venue.
```

- [ ] **Step 2: testing-conventions.md**

In the E2E section, replace the bullet starting "Name fixtures uniquely per run and clean up afterwards" with:

```markdown
- Name fixtures uniquely per run and clean up afterwards; specs run against the
  development database, not a dedicated one. Deleting an event through the
  API also deletes its venue, so deleting the events a test created is enough.
  The events spec runs a `beforeAll` sweep for anything a previous,
  interrupted run left behind — before any test in the file, so a run that
  fails early still leaves the database clean for the next one.
```

- [ ] **Step 3: Spec deviation note**

In the spec, replace "`address.repository.ts` stays, now called only from the event service." with: "The `addresses` module is deleted: the event repository writes the venue with Prisma nested writes (`create` / `upsert` / `delete`), so nothing calls an address repository."

- [ ] **Step 4: Full check and commit**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add docs
git commit -m "Document the venue as part of the event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
