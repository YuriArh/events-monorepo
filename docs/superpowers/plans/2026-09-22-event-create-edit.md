# Event Create & Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create and edit events from the web app, including description, start/end dates, an image, and an optional 1:1 venue.

**Architecture:** Zod schemas move into a new `@repo/contracts` package consumed by both the API and the web app, so validation cannot drift. Two new routes (`/events/new`, `/events/[id]/edit`) render one shared `EventForm` built on TanStack Form. The form holds what the user manipulates, and a mapping layer turns that into up to three sequential API calls at submit: upload image, write address, write event.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, StyleX, TanStack Query 5, TanStack Form 1, Zod 4, Fastify 5, Prisma 7, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-event-create-edit-design.md`

## Global Constraints

- Styling is **StyleX only**. Never add Tailwind utility classes. See `docs/css-conventions.md`.
- `apps/web/app/components/ui/**` is vendored registry code. Add components with the shadcn CLI; never hand-edit them.
- Relative imports inside a package need the `.js` extension (`NodeNext`), even though sources are `.ts`.
- Workspace dependencies use `workspace:*`, never `"*"`.
- Use `pnpm --filter <pkg> exec <tool>`, never `pnpm dlx`, for tools already installed. The one exception is the shadcn registry CLI, which is intentionally `pnpm dlx shadcn@latest`.
- No `any`. Narrow `unknown` with a type guard.
- Exact pinned versions: `zod@4.6.5`, `@tanstack/react-form@1.33.5`, `vitest@5.0.1`, `typescript@7.0.2`.
- Postgres must be running (`docker compose up -d`) for API tests.
- `pnpm test` runs `prisma migrate deploy` against `eventapp_test` first. Prisma blocks AI agents from destructive migrate commands unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` is set to the user's consent text.

---

## File Structure

**New package — `packages/contracts/`**

| File | Responsibility |
| --- | --- |
| `package.json` | `@repo/contracts`, owns the `zod` dependency |
| `tsconfig.json` | Extends `@repo/typescript-config/base.json` |
| `vitest.config.ts` | Node environment, `src/**/*.test.ts` |
| `src/event.ts` | Event field shape; wire (string) and payload (Date) schemas |
| `src/address.ts` | Address field shape and schemas |
| `src/index.ts` | Public re-exports |
| `src/event.test.ts` | Proves wire and payload shapes stay in step |

**Modified — `apps/api/`**

| File | Change |
| --- | --- |
| `src/modules/events/event.schema.ts` | Becomes a thin re-export of `@repo/contracts` |
| `src/modules/addresses/address.schema.ts` | Same |
| `package.json` | Add `@repo/contracts`, drop direct `zod` |

**New/modified — `apps/web/`**

| File | Responsibility |
| --- | --- |
| `app/lib/events.ts` | API client: events, addresses, image upload, query keys |
| `app/lib/event-form.ts` | Pure mapping: form values ↔ API payloads, dirty diff |
| `app/lib/event-form.test.ts` | Unit tests for the mapping |
| `app/components/event-form.tsx` | The shared form (name, description, dates, image, venue) |
| `app/events/new/page.tsx` | Create route |
| `app/events/[id]/edit/page.tsx` | Edit route |
| `app/page.tsx` | List: dialog removed, rows link to edit |
| `app/components/ui/{textarea,date-picker,calendar}.tsx` | Vendored from the registry |

---

### Task 1: Shared contracts package

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/{event.ts,address.ts,index.ts,event.test.ts}`
- Modify: `apps/api/src/modules/events/event.schema.ts`, `apps/api/src/modules/addresses/address.schema.ts`, `apps/api/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `createEventInput`, `updateEventInput`, `createEventPayload`, `updateEventPayload`, `eventParamsSchema`, `imageKeySchema`, `createAddressInput`, `updateAddressInput`, `addressParamsSchema`, and the types `CreateEventInput`, `UpdateEventInput`, `CreateAddressInput`, `UpdateAddressInput`

- [ ] **Step 1: Create the package manifest**

`packages/contracts/package.json`:

```json
{
  "name": "@repo/contracts",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "7.0.2",
    "vitest": "5.0.1"
  }
}
```

`packages/contracts/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

`packages/contracts/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test**

`packages/contracts/src/event.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createEventInput, createEventPayload } from "./event.js";

describe("createEventInput (wire shape)", () => {
  it("keeps dates as ISO strings", () => {
    const parsed = createEventInput.parse({
      name: "Team offsite",
      startsAt: "2026-10-01T18:00:00.000Z",
    });

    expect(parsed.startsAt).toBe("2026-10-01T18:00:00.000Z");
  });

  it("rejects a datetime without an offset", () => {
    expect(() => createEventInput.parse({ name: "x", startsAt: "2026-10-01T18:00:00" })).toThrow();
  });
});

describe("createEventPayload (server shape)", () => {
  it("coerces dates to Date objects", () => {
    const parsed = createEventPayload.parse({
      name: "Team offsite",
      startsAt: "2026-10-01T18:00:00.000Z",
    });

    expect(parsed.startsAt).toBeInstanceOf(Date);
  });

  it("shares the non-date rules with the wire shape", () => {
    expect(() => createEventPayload.parse({ name: "" })).toThrow();
    expect(() => createEventInput.parse({ name: "" })).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @repo/contracts exec vitest run`
Expected: FAIL — `Cannot find module './event.js'`

- [ ] **Step 4: Write the event schemas**

`packages/contracts/src/event.ts`:

```ts
import { z } from "zod";

export const eventParamsSchema = z.object({
  id: z.string().min(1),
});

/** Filenames are generated by the upload endpoint; reject anything path-like. */
export const imageKeySchema = z
  .string()
  .regex(/^[a-z0-9]+\.(jpg|jpeg|png|webp|gif)$/i, "Invalid image key");

/** Turns an ISO string into a Date. Server-side only. */
const dateFromIso = z.iso.datetime({ offset: true }).pipe(z.coerce.date());

/**
 * One field shape, two schemas derived from it: the browser works in strings,
 * the server wants Date objects. Deriving both from here means the non-date
 * rules cannot drift apart.
 */
const eventFields = {
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullish(),
  /** Links to an existing Address; null detaches the venue. */
  addressId: z.string().min(1).nullish(),
  imageKey: imageKeySchema.nullish(),
  startsAt: z.iso.datetime({ offset: true }).nullish(),
  endsAt: z.iso.datetime({ offset: true }).nullish(),
};

/** Wire shape — what the form validates against. */
export const createEventInput = z.object(eventFields);
export const updateEventInput = createEventInput.partial();

/** Server shape — what the API parses request bodies with. */
export const createEventPayload = createEventInput.extend({
  startsAt: dateFromIso.nullish(),
  endsAt: dateFromIso.nullish(),
});
export const updateEventPayload = createEventPayload.partial();

export type CreateEventInput = z.infer<typeof createEventInput>;
export type UpdateEventInput = z.infer<typeof updateEventInput>;
export type CreateEventPayload = z.infer<typeof createEventPayload>;
export type UpdateEventPayload = z.infer<typeof updateEventPayload>;
```

- [ ] **Step 5: Write the address schemas**

`packages/contracts/src/address.ts`:

```ts
import { z } from "zod";

export const addressParamsSchema = z.object({
  id: z.string().min(1),
});

/** line1, city and country are NOT NULL in the database. */
export const createAddressInput = z.object({
  label: z.string().max(255).nullish(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).nullish(),
  city: z.string().min(1).max(255),
  region: z.string().max(255).nullish(),
  postalCode: z.string().max(32).nullish(),
  country: z.string().min(1).max(255),
});

export const updateAddressInput = createAddressInput.partial();

export type CreateAddressInput = z.infer<typeof createAddressInput>;
export type UpdateAddressInput = z.infer<typeof updateAddressInput>;
```

`packages/contracts/src/index.ts`:

```ts
export * from "./address.js";
export * from "./event.js";
```

- [ ] **Step 6: Install and run the test to verify it passes**

Run: `pnpm install && pnpm --filter @repo/contracts exec vitest run`
Expected: PASS — 4 tests

- [ ] **Step 7: Point the API at the shared package**

Add the dependency and drop the direct `zod` entry from `apps/api/package.json`:

Run: `pnpm --filter api add @repo/contracts@workspace:* && pnpm --filter api remove zod`

Replace `apps/api/src/modules/events/event.schema.ts` entirely:

```ts
/**
 * The schemas live in @repo/contracts so the web app validates against the same
 * rules. The API uses the Date-coercing variants; the names below are kept so
 * the module's routes and types are unchanged.
 */
export {
  createEventPayload as createEventSchema,
  eventParamsSchema,
  updateEventPayload as updateEventSchema,
} from "@repo/contracts";
```

Replace `apps/api/src/modules/addresses/address.schema.ts` entirely:

```ts
export {
  addressParamsSchema,
  createAddressInput as createAddressSchema,
  updateAddressInput as updateAddressSchema,
} from "@repo/contracts";
```

- [ ] **Step 8: Fix the remaining `zod` import in the API**

`apps/api/src/app.ts` imports `ZodError` from `zod` directly. Since `zod` is no longer a direct dependency, re-export it from the contracts package. Append to `packages/contracts/src/index.ts`:

```ts
export { ZodError, z } from "zod";
```

Then change the import at the top of `apps/api/src/app.ts` from:

```ts
import { ZodError } from "zod";
```

to:

```ts
import { ZodError } from "@repo/contracts";
```

- [ ] **Step 9: Verify the whole API still works**

Run: `pnpm --filter api exec tsc --noEmit && pnpm --filter api test`
Expected: PASS — 33 tests, no type errors. The contract move must be behaviour-neutral.

- [ ] **Step 10: Commit**

```bash
git add packages/contracts apps/api/package.json apps/api/src pnpm-lock.yaml
git commit -m "Extract zod schemas into @repo/contracts"
```

---

### Task 2: Web API client

**Files:**
- Modify: `apps/web/app/lib/events.ts`
- Modify: `apps/web/app/lib/events.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `CreateEventInput`, `UpdateEventInput`, `CreateAddressInput`, `UpdateAddressInput` from Task 1
- Produces: types `Address`, `EventRecord`; `eventKeys.all`, `eventKeys.detail(id)`; `eventsApi.{list,get,create,update,remove}`; `addressesApi.{create,update}`; `uploadImage(file)`

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter web add @repo/contracts@workspace:*`

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/app/lib/events.test.ts`:

```ts
describe("eventsApi.get", () => {
    it("requests a single event", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: "1", name: "Retro" }));

        await eventsApi.get("1");

        expect(lastCall().url).toBe("http://api.test/api/events/1");
    });
});

describe("uploadImage", () => {
    it("posts multipart form data without a json content-type", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ imageKey: "abc.png" }, 201));

        const file = new File(["x"], "photo.png", { type: "image/png" });
        await expect(uploadImage(file)).resolves.toEqual({ imageKey: "abc.png" });

        const { url, init, headers } = lastCall();
        expect(url).toBe("http://api.test/api/events/upload");
        expect(init.method).toBe("POST");
        expect(init.body).toBeInstanceOf(FormData);
        // The browser sets the multipart boundary itself; forcing a content-type breaks it.
        expect(headers["Content-Type"]).toBeUndefined();
    });
});

describe("addressesApi", () => {
    it("creates an address", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: "a1" }, 201));

        await addressesApi.create({ line1: "1 Civic Square", city: "Amsterdam", country: "NL" });

        const { url, init } = lastCall();
        expect(url).toBe("http://api.test/api/addresses");
        expect(init.method).toBe("POST");
    });

    it("updates an address", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: "a1" }));

        await addressesApi.update("a1", { city: "Rotterdam" });

        const { url, init } = lastCall();
        expect(url).toBe("http://api.test/api/addresses/a1");
        expect(init.method).toBe("PATCH");
    });
});
```

Update the import at the top of that file:

```ts
import { addressesApi, eventsApi, uploadImage } from "./events";
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter web exec vitest run`
Expected: FAIL — `uploadImage is not a function`

- [ ] **Step 4: Rewrite the client**

Replace `apps/web/app/lib/events.ts` entirely:

```ts
import type {
    CreateAddressInput,
    CreateEventInput,
    UpdateAddressInput,
    UpdateEventInput,
} from "@repo/contracts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Address = {
    id: string;
    label: string | null;
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
    createdAt: string;
    updatedAt: string;
};

/** Dates arrive as ISO strings because this is JSON, not the Prisma model. */
export type EventRecord = {
    id: string;
    name: string;
    description: string | null;
    addressId: string | null;
    imageKey: string | null;
    startsAt: string | null;
    endsAt: string | null;
    createdAt: string;
    updatedAt: string;
    address: Address | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            // Only on requests that actually carry a JSON body. Sending it with an
            // empty body makes Fastify reject the request while parsing, and setting
            // it on FormData destroys the multipart boundary.
            ...(init?.body && typeof init.body === "string"
                ? { "Content-Type": "application/json" }
                : {}),
            ...init?.headers,
        },
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Request failed with status ${response.status}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

export const eventKeys = {
    all: ["events"] as const,
    detail: (id: string) => ["events", id] as const,
};

export const eventsApi = {
    list: () => request<EventRecord[]>("/api/events"),
    get: (id: string) => request<EventRecord>(`/api/events/${id}`),
    create: (data: CreateEventInput) =>
        request<EventRecord>("/api/events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: UpdateEventInput) =>
        request<EventRecord>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/api/events/${id}`, { method: "DELETE" }),
};

export const addressesApi = {
    create: (data: CreateAddressInput) =>
        request<Address>("/api/addresses", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: UpdateAddressInput) =>
        request<Address>(`/api/addresses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};

/**
 * The single place that knows how images are stored. Swapping local disk for S3
 * should change this function and nothing else.
 */
export const uploadImage = async (file: File) => {
    const body = new FormData();
    body.append("file", file);

    return request<{ imageKey: string }>("/api/events/upload", { method: "POST", body });
};

/** Absolute URL for a stored image key, for use in <img src>. */
export const imageUrl = (key: string) => `${API_URL}/uploads/${key}`;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web exec vitest run`
Expected: PASS — 11 tests

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/lib/events.ts apps/web/app/lib/events.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "Extend web API client with detail, upload and address calls"
```

---

### Task 3: Form mapping helpers

Pure functions, no React. These carry the logic most likely to break silently.

**Files:**
- Create: `apps/web/app/lib/event-form.ts`
- Create: `apps/web/app/lib/event-form.test.ts`

**Interfaces:**
- Consumes: `EventRecord` from Task 2, `CreateEventInput` from Task 1
- Produces: `type EventFormValues`, `type VenueValues`, `emptyFormValues`, `toFormValues(event)`, `toEventInput(values, { imageKey, addressId })`, `venueIsEmpty(venue)`

- [ ] **Step 1: Write the failing tests**

`apps/web/app/lib/event-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { EventRecord } from "./events";
import { emptyFormValues, toEventInput, toFormValues, venueIsEmpty } from "./event-form";

const record: EventRecord = {
    id: "e1",
    name: "Team offsite",
    description: "Two days",
    addressId: "a1",
    imageKey: "abc.png",
    startsAt: "2026-10-01T18:00:00.000Z",
    endsAt: "2026-10-01T21:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    address: {
        id: "a1",
        label: null,
        line1: "1 Civic Square",
        line2: null,
        city: "Amsterdam",
        region: null,
        postalCode: "1011 AB",
        country: "NL",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
    },
};

describe("toFormValues", () => {
    it("turns ISO strings into Date objects for the picker", () => {
        const values = toFormValues(record);

        expect(values.startsAt).toBeInstanceOf(Date);
        expect(values.startsAt?.toISOString()).toBe("2026-10-01T18:00:00.000Z");
    });

    it("keeps null dates null", () => {
        const values = toFormValues({ ...record, startsAt: null, endsAt: null });

        expect(values.startsAt).toBeNull();
        expect(values.endsAt).toBeNull();
    });

    it("lifts the nested address into venue fields", () => {
        expect(toFormValues(record).venue).toMatchObject({ line1: "1 Civic Square", city: "Amsterdam" });
    });

    it("uses blank venue fields when the event has no address", () => {
        expect(toFormValues({ ...record, addressId: null, address: null }).venue).toEqual(
            emptyFormValues().venue,
        );
    });
});

describe("toEventInput", () => {
    it("serialises dates back to ISO with an offset", () => {
        const input = toEventInput(toFormValues(record), { imageKey: null, addressId: null });

        expect(input.startsAt).toBe("2026-10-01T18:00:00.000Z");
    });

    it("passes through the resolved image key and address id", () => {
        const input = toEventInput(emptyFormValues(), { imageKey: "x.png", addressId: "a9" });

        expect(input).toMatchObject({ imageKey: "x.png", addressId: "a9" });
    });

    it("sends empty text as null rather than an empty string", () => {
        const input = toEventInput(
            { ...emptyFormValues(), name: "Only a name" },
            { imageKey: null, addressId: null },
        );

        expect(input.description).toBeNull();
    });
});

describe("venueIsEmpty", () => {
    it("is true when every field is blank or whitespace", () => {
        expect(venueIsEmpty(emptyFormValues().venue)).toBe(true);
        expect(venueIsEmpty({ ...emptyFormValues().venue, city: "   " })).toBe(true);
    });

    it("is false once any field has content", () => {
        expect(venueIsEmpty({ ...emptyFormValues().venue, city: "Amsterdam" })).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web exec vitest run event-form`
Expected: FAIL — `Cannot find module './event-form'`

- [ ] **Step 3: Write the helpers**

`apps/web/app/lib/event-form.ts`:

```ts
import type { CreateEventInput } from "@repo/contracts";

import type { EventRecord } from "./events";

export type VenueValues = {
    label: string;
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
};

export type EventFormValues = {
    name: string;
    description: string;
    startsAt: Date | null;
    endsAt: Date | null;
    venue: VenueValues;
};

const emptyVenue = (): VenueValues => ({
    label: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
});

export const emptyFormValues = (): EventFormValues => ({
    name: "",
    description: "",
    startsAt: null,
    endsAt: null,
    venue: emptyVenue(),
});

/** Text inputs yield "" for absent values; the API wants null. */
const orNull = (value: string) => {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

export const toFormValues = (event: EventRecord): EventFormValues => ({
    name: event.name,
    description: event.description ?? "",
    startsAt: event.startsAt ? new Date(event.startsAt) : null,
    endsAt: event.endsAt ? new Date(event.endsAt) : null,
    venue: event.address
        ? {
              label: event.address.label ?? "",
              line1: event.address.line1,
              line2: event.address.line2 ?? "",
              city: event.address.city,
              region: event.address.region ?? "",
              postalCode: event.address.postalCode ?? "",
              country: event.address.country,
          }
        : emptyVenue(),
});

export const venueIsEmpty = (venue: VenueValues) =>
    Object.values(venue).every((value) => value.trim() === "");

/**
 * `imageKey` and `addressId` are resolved by the submit sequence before this
 * runs, which is why they are passed in rather than read off the form.
 */
export const toEventInput = (
    values: EventFormValues,
    resolved: { imageKey: string | null; addressId: string | null },
): CreateEventInput => ({
    name: values.name.trim(),
    description: orNull(values.description),
    // toISOString always emits a "Z" offset, which satisfies the contract's
    // `datetime({ offset: true })` rule.
    startsAt: values.startsAt ? values.startsAt.toISOString() : null,
    endsAt: values.endsAt ? values.endsAt.toISOString() : null,
    imageKey: resolved.imageKey,
    addressId: resolved.addressId,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web exec vitest run event-form`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/lib/event-form.ts apps/web/app/lib/event-form.test.ts
git commit -m "Add pure mapping helpers for the event form"
```

---

### Task 4: Vendor components and install TanStack Form

No behaviour change; this task exists so the next one has its building blocks and so a broken registry pull is caught on its own.

**Files:**
- Create: `apps/web/app/components/ui/{textarea,calendar,date-picker}.tsx` (generated)
- Modify: `apps/web/package.json`

- [ ] **Step 1: Pull the registry components**

Run from `apps/web`:

```bash
pnpm dlx shadcn@latest add https://stylexui.dev/r/textarea.json --yes
pnpm dlx shadcn@latest add https://stylexui.dev/r/calendar.json --yes
pnpm dlx shadcn@latest add https://stylexui.dev/r/date-picker.json --yes
```

`dlx` is correct here: the shadcn CLI is not a project dependency.

- [ ] **Step 2: Check the generated imports**

Registry files import tokens from `@/styles/tokens.stylex`. Confirm nothing points at the wrong path:

Run: `grep -rn "tokens.stylex" apps/web/app/components/ui/ | grep -v "@/styles/tokens.stylex"`
Expected: no output. If any file imports from elsewhere, fix it to `@/styles/tokens.stylex`.

- [ ] **Step 3: Install TanStack Form**

Run: `pnpm --filter web add @tanstack/react-form@1.33.5`

Zod 4 implements Standard Schema, so its schemas pass straight to the form validators; no adapter package.

- [ ] **Step 4: Verify the app still builds**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web build`
Expected: PASS. A registry component that fails to compile must be fixed before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/ui apps/web/package.json pnpm-lock.yaml
git commit -m "Vendor textarea, calendar and date-picker; add TanStack Form"
```

---

### Task 5: Event form with core fields, and the create route

Delivers a working `/events/new` for name, description and dates. Image and venue arrive in Tasks 6 and 7.

**Files:**
- Create: `apps/web/app/components/event-form.tsx`
- Create: `apps/web/app/events/new/page.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `emptyFormValues`, `toEventInput`, `EventFormValues` (Task 3); `eventsApi`, `eventKeys` (Task 2)
- Produces: `<EventForm mode initialValues onSubmit submitLabel />` where `onSubmit: (values: EventFormValues) => Promise<void>`

- [ ] **Step 1: Write the form component**

`apps/web/app/components/event-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventFormValues } from "@/lib/event-form";
import { colors, radius, typography } from "@/styles/tokens.stylex";

const spin = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
    form: { display: "flex", flexDirection: "column", gap: "1.5rem" },
    field: { display: "grid", gap: "0.5rem" },
    row: {
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: { default: "1fr", "@media (min-width: 640px)": "1fr 1fr" },
    },
    error: { color: colors.destructive },
    banner: {
        borderRadius: radius.lg,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: `color-mix(in oklab, ${colors.destructive} 30%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${colors.destructive} 10%, transparent)`,
        color: colors.destructive,
        paddingInline: "1rem",
        paddingBlock: "0.75rem",
    },
    actions: { display: "flex", justifyContent: "flex-end", gap: "0.5rem" },
    spinner: {
        animationName: spin,
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
});

export type EventFormProps = {
    initialValues: EventFormValues;
    submitLabel: string;
    onSubmit: (values: EventFormValues) => Promise<void>;
    onCancel: () => void;
};

export function EventForm({ initialValues, submitLabel, onSubmit, onCancel }: EventFormProps) {
    const [submitError, setSubmitError] = useState<string | null>(null);

    const form = useForm({
        defaultValues: initialValues,
        onSubmit: async ({ value }) => {
            setSubmitError(null);

            try {
                await onSubmit(value);
            } catch (error) {
                // The form keeps its values so the user can retry — see the
                // partial-failure note in the design doc.
                setSubmitError(error instanceof Error ? error.message : "Something went wrong");
            }
        },
    });

    return (
        <form
            {...stylex.props(styles.form)}
            onSubmit={(event) => {
                event.preventDefault();
                form.handleSubmit();
            }}>
            {submitError && <div {...stylex.props(styles.banner, typography.sm)}>{submitError}</div>}

            <form.Field
                name="name"
                validators={{
                    onChange: ({ value }: { value: string }) =>
                        value.trim() === "" ? "Name is required" : undefined,
                }}>
                {(field) => (
                    <div {...stylex.props(styles.field)}>
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="e.g. Team offsite"
                        />
                        {field.state.meta.errors.length > 0 && (
                            <p {...stylex.props(styles.error, typography.sm)}>
                                {String(field.state.meta.errors[0])}
                            </p>
                        )}
                    </div>
                )}
            </form.Field>

            <form.Field name="description">
                {(field) => (
                    <div {...stylex.props(styles.field)}>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            rows={4}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                        />
                    </div>
                )}
            </form.Field>

            <div {...stylex.props(styles.row)}>
                <form.Field name="startsAt">
                    {(field) => (
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="startsAt">Starts</Label>
                            <Input
                                id="startsAt"
                                type="datetime-local"
                                value={toLocalInput(field.state.value)}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(fromLocalInput(event.target.value))}
                            />
                        </div>
                    )}
                </form.Field>

                <form.Field name="endsAt">
                    {(field) => (
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="endsAt">Ends</Label>
                            <Input
                                id="endsAt"
                                type="datetime-local"
                                value={toLocalInput(field.state.value)}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(fromLocalInput(event.target.value))}
                            />
                        </div>
                    )}
                </form.Field>
            </div>

            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (
                    <div {...stylex.props(styles.actions)}>
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!canSubmit || isSubmitting}>
                            {isSubmitting && <Loader2Icon {...stylex.props(styles.spinner)} />}
                            {submitLabel}
                        </Button>
                    </div>
                )}
            </form.Subscribe>
        </form>
    );
}

/** `datetime-local` speaks "YYYY-MM-DDTHH:mm" in local time, with no offset. */
const toLocalInput = (value: Date | null) => {
    if (!value) return "";

    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

const fromLocalInput = (value: string) => (value === "" ? null : new Date(value));
```

**Deliberately `datetime-local` for now.** The spec calls for the registry Date
Picker, but its prop signature can't be known until Task 4 generates the file.
Task 10 swaps it in against the real API. These two fields consume and produce
`Date | null`, so that swap touches only the two field bodies.

- [ ] **Step 2: Write the create route**

`apps/web/app/events/new/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { EventForm } from "@/components/event-form";
import { Card, CardContent } from "@/components/ui/card";
import { emptyFormValues, toEventInput, type EventFormValues } from "@/lib/event-form";
import { eventKeys, eventsApi } from "@/lib/events";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: { default: "1rem", "@media (min-width: 640px)": "1.5rem" },
        paddingBlock: "3.5rem",
    },
    title: { fontSize: "1.875rem", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.025em" },
    header: { marginBottom: "1.75rem" },
});

export default function NewEventPage() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const createEvent = useMutation({
        mutationFn: async (values: EventFormValues) => {
            const input = toEventInput(values, { imageKey: null, addressId: null });

            return eventsApi.create(input);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: eventKeys.all });
            router.push("/");
        },
    });

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <h1 {...stylex.props(styles.title)}>New event</h1>
                </div>

                <Card>
                    <CardContent>
                        <EventForm
                            initialValues={emptyFormValues()}
                            submitLabel="Create"
                            onCancel={() => router.push("/")}
                            onSubmit={async (values) => {
                                await createEvent.mutateAsync(values);
                            }}
                        />
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
```

- [ ] **Step 3: Point the list's button at the new route**

In `apps/web/app/page.tsx`, replace the header's `New Event` button (the one calling `openCreateForm`) with a link. Add at the top:

```tsx
import Link from "next/link";
```

and replace that `<Button onClick={openCreateForm}>` element with:

```tsx
<Button render={<Link href="/events/new" />}>
    <PlusIcon />
    New Event
</Button>
```

Base UI's `render` prop makes the button render as the link while keeping its styling. Do the same for the empty state's button.

- [ ] **Step 4: Validate against the shared contract, not a hand-rolled rule**

The field-level check above gives instant feedback, but the shared schema must be
the client's authority — that is the whole point of `@repo/contracts`. Add a
mapping helper and a test.

Append to `apps/web/app/lib/event-form.test.ts`:

```ts
describe("issuesByField", () => {
    it("keys zod issues by their field path", () => {
        const result = createEventInput.safeParse({ name: "" });

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(issuesByField(result.error.issues)).toHaveProperty("name");
    });

    it("puts path-less issues under the form key", () => {
        expect(issuesByField([{ path: [], message: "bad" }])).toEqual({ form: "bad" });
    });
});
```

Add `createEventInput` to the `@repo/contracts` import and `issuesByField` to the
`./event-form` import in that test file.

Append to `apps/web/app/lib/event-form.ts`:

```ts
/** Shapes zod issues (from the client parse or a server 400) for field display. */
export const issuesByField = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
    const byField: Record<string, string> = {};

    for (const issue of issues) {
        const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
        byField[key] ??= issue.message;
    }

    return byField;
};
```

Run: `pnpm --filter web exec vitest run event-form`
Expected: PASS

Then in `apps/web/app/components/event-form.tsx`, gate submission on the contract.
Add the imports:

```tsx
import { createEventInput } from "@repo/contracts";
import { issuesByField, toEventInput, venueIsEmpty, type EventFormValues } from "@/lib/event-form";
```

And add a `useState` for field-level server errors plus the parse, replacing the
body of the `onSubmit` passed to `useForm`:

```tsx
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const form = useForm({
        defaultValues: initialValues,
        onSubmit: async ({ value }) => {
            setSubmitError(null);
            setFieldErrors({});

            // The contract is the authority; the field rules above are just fast feedback.
            const parsed = createEventInput.safeParse(
                toEventInput(value, { imageKey: null, addressId: null }),
            );

            if (!parsed.success) {
                setFieldErrors(issuesByField(parsed.error.issues));
                return;
            }

            try {
                await onSubmit(value);
            } catch (error) {
                // The form keeps its values so the user can retry — see the
                // partial-failure note in the design doc.
                setSubmitError(error instanceof Error ? error.message : "Something went wrong");
            }
        },
    });
```

Render `fieldErrors.name` beneath the name field, alongside the existing check:

```tsx
                        {(field.state.meta.errors.length > 0 || fieldErrors.name) && (
                            <p {...stylex.props(styles.error, typography.sm)}>
                                {String(field.state.meta.errors[0] ?? fieldErrors.name)}
                            </p>
                        )}
```

- [ ] **Step 5: Verify types and build**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec biome lint .`
Expected: PASS

- [ ] **Step 6: Verify by hand**

Run `docker compose up -d && pnpm dev`, open `http://localhost:3000/events/new`, create an event with a name, description and both dates. Expect a redirect to `/` with the event visible and its date rendered.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/components/event-form.tsx apps/web/app/events apps/web/app/page.tsx apps/web/app/lib
git commit -m "Add event form and create route"
```

---

### Task 6: Image field

**Files:**
- Modify: `apps/web/app/components/event-form.tsx`
- Modify: `apps/web/app/events/new/page.tsx`
- Modify: `apps/web/app/lib/event-form.ts`, `apps/web/app/lib/event-form.test.ts`

**Interfaces:**
- Consumes: `uploadImage`, `imageUrl` (Task 2)
- Produces: `EventFormValues` gains `imageFile: File | null` and `existingImageKey: string | null`; `resolveImageKey(values)` in `event-form.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/app/lib/event-form.test.ts`:

```ts
describe("resolveImageKey", () => {
    it("keeps the existing key when no new file was chosen", async () => {
        const upload = vi.fn();
        const values = { ...emptyFormValues(), existingImageKey: "old.png", imageFile: null };

        await expect(resolveImageKey(values, upload)).resolves.toBe("old.png");
        expect(upload).not.toHaveBeenCalled();
    });

    it("uploads and returns the new key when a file was chosen", async () => {
        const upload = vi.fn().mockResolvedValue({ imageKey: "new.png" });
        const file = new File(["x"], "photo.png", { type: "image/png" });
        const values = { ...emptyFormValues(), existingImageKey: "old.png", imageFile: file };

        await expect(resolveImageKey(values, upload)).resolves.toBe("new.png");
        expect(upload).toHaveBeenCalledWith(file);
    });
});
```

Add `vi` to the vitest import and `resolveImageKey` to the `./event-form` import in that file.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run event-form`
Expected: FAIL — `resolveImageKey is not a function`

- [ ] **Step 3: Extend the helpers**

In `apps/web/app/lib/event-form.ts`, add the two fields to `EventFormValues`:

```ts
export type EventFormValues = {
    name: string;
    description: string;
    startsAt: Date | null;
    endsAt: Date | null;
    venue: VenueValues;
    imageFile: File | null;
    existingImageKey: string | null;
};
```

Add them to `emptyFormValues()`:

```ts
export const emptyFormValues = (): EventFormValues => ({
    name: "",
    description: "",
    startsAt: null,
    endsAt: null,
    venue: emptyVenue(),
    imageFile: null,
    existingImageKey: null,
});
```

Add them to `toFormValues()` — inside the returned object:

```ts
    imageFile: null,
    existingImageKey: event.imageKey,
```

And append the resolver:

```ts
/**
 * Step 1 of the submit sequence. Uploading only on submit means an abandoned
 * form leaves nothing behind.
 */
export const resolveImageKey = async (
    values: EventFormValues,
    upload: (file: File) => Promise<{ imageKey: string }>,
): Promise<string | null> => {
    if (!values.imageFile) {
        return values.existingImageKey;
    }

    const { imageKey } = await upload(values.imageFile);

    return imageKey;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web exec vitest run event-form`
Expected: PASS — 10 tests

- [ ] **Step 5: Add the field to the form**

In `apps/web/app/components/event-form.tsx`, add these styles to the `stylex.create` block:

```ts
    preview: { width: "8rem", height: "8rem", objectFit: "cover", borderRadius: radius.md },
    imageRow: { display: "flex", alignItems: "center", gap: "1rem" },
```

Add the import:

```tsx
import { imageUrl } from "@/lib/events";
```

And insert this field before the `form.Subscribe` block:

```tsx
            <form.Field name="imageFile">
                {(field) => {
                    const existingKey = form.state.values.existingImageKey;
                    const preview = field.state.value
                        ? URL.createObjectURL(field.state.value)
                        : existingKey
                          ? imageUrl(existingKey)
                          : null;

                    return (
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="image">Image</Label>
                            <div {...stylex.props(styles.imageRow)}>
                                {preview && (
                                    <img src={preview} alt="" {...stylex.props(styles.preview)} />
                                )}
                                <Input
                                    id="image"
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={(event) =>
                                        field.handleChange(event.target.files?.[0] ?? null)
                                    }
                                />
                            </div>
                        </div>
                    );
                }}
            </form.Field>
```

- [ ] **Step 6: Upload during submit**

In `apps/web/app/events/new/page.tsx`, change the mutation body to resolve the key first:

```tsx
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);
            const input = toEventInput(values, { imageKey, addressId: null });

            return eventsApi.create(input);
        },
```

Update the imports in that file:

```tsx
import { emptyFormValues, resolveImageKey, toEventInput, type EventFormValues } from "@/lib/event-form";
import { eventKeys, eventsApi, uploadImage } from "@/lib/events";
```

- [ ] **Step 7: Verify by hand**

With `pnpm dev` running, create an event with a PNG. Expect the preview before submit, then the image visible via `http://localhost:4000/uploads/<key>`. Confirm `apps/api/uploads/` gained exactly one file.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/components/event-form.tsx apps/web/app/events apps/web/app/lib
git commit -m "Add image upload to the event form"
```

---

### Task 7: Venue section

**Files:**
- Modify: `apps/web/app/components/event-form.tsx`
- Modify: `apps/web/app/events/new/page.tsx`
- Modify: `apps/web/app/lib/event-form.ts`, `apps/web/app/lib/event-form.test.ts`

**Interfaces:**
- Consumes: `addressesApi` (Task 2), `venueIsEmpty` (Task 3)
- Produces: `toAddressInput(venue)`, `resolveAddressId(values, existingAddressId, api)` in `event-form.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/app/lib/event-form.test.ts`:

```ts
describe("resolveAddressId", () => {
    const api = () => ({
        create: vi.fn().mockResolvedValue({ id: "new-address" }),
        update: vi.fn().mockResolvedValue({ id: "existing" }),
    });

    it("returns null and writes nothing when the venue is empty", async () => {
        const calls = api();

        await expect(resolveAddressId(emptyFormValues(), null, calls)).resolves.toBeNull();
        expect(calls.create).not.toHaveBeenCalled();
        expect(calls.update).not.toHaveBeenCalled();
    });

    it("creates an address when the event has none", async () => {
        const calls = api();
        const values = {
            ...emptyFormValues(),
            venue: { ...emptyFormValues().venue, line1: "1 Civic Square", city: "Amsterdam", country: "NL" },
        };

        await expect(resolveAddressId(values, null, calls)).resolves.toBe("new-address");
        expect(calls.create).toHaveBeenCalledWith(
            expect.objectContaining({ line1: "1 Civic Square", city: "Amsterdam", country: "NL" }),
        );
    });

    // Safe because the relation is 1:1 — no other event can reference this address.
    it("updates in place when the event already has an address", async () => {
        const calls = api();
        const values = {
            ...emptyFormValues(),
            venue: { ...emptyFormValues().venue, line1: "2 New Road", city: "Rotterdam", country: "NL" },
        };

        await expect(resolveAddressId(values, "existing", calls)).resolves.toBe("existing");
        expect(calls.update).toHaveBeenCalledWith("existing", expect.objectContaining({ city: "Rotterdam" }));
    });

    it("detaches when the venue is cleared on an event that had one", async () => {
        const calls = api();

        await expect(resolveAddressId(emptyFormValues(), "existing", calls)).resolves.toBeNull();
        expect(calls.update).not.toHaveBeenCalled();
    });
});
```

Add `resolveAddressId` to the `./event-form` import.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run event-form`
Expected: FAIL — `resolveAddressId is not a function`

- [ ] **Step 3: Extend the helpers**

Append to `apps/web/app/lib/event-form.ts`:

```ts
import type { CreateAddressInput } from "@repo/contracts";

export const toAddressInput = (venue: VenueValues): CreateAddressInput => ({
    label: orNull(venue.label),
    line1: venue.line1.trim(),
    line2: orNull(venue.line2),
    city: venue.city.trim(),
    region: orNull(venue.region),
    postalCode: orNull(venue.postalCode),
    country: venue.country.trim(),
});

type AddressCalls = {
    create: (input: CreateAddressInput) => Promise<{ id: string }>;
    update: (id: string, input: CreateAddressInput) => Promise<{ id: string }>;
};

/**
 * Step 2 of the submit sequence. Updating in place is safe because Event.addressId
 * is unique — an address belongs to exactly one event.
 */
export const resolveAddressId = async (
    values: EventFormValues,
    existingAddressId: string | null,
    api: AddressCalls,
): Promise<string | null> => {
    if (venueIsEmpty(values.venue)) {
        return null;
    }

    const input = toAddressInput(values.venue);

    if (existingAddressId) {
        await api.update(existingAddressId, input);
        return existingAddressId;
    }

    const created = await api.create(input);
    return created.id;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web exec vitest run event-form`
Expected: PASS — 14 tests

- [ ] **Step 5: Add the venue fields to the form**

In `apps/web/app/components/event-form.tsx`, add these styles:

```ts
    section: {
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        borderTopWidth: "1px",
        borderTopStyle: "solid",
        borderTopColor: colors.border,
        paddingTop: "1.5rem",
    },
    sectionTitle: { fontWeight: 500 },
    hint: { color: colors.mutedForeground },
```

Insert this block before the `form.Subscribe`:

```tsx
            <div {...stylex.props(styles.section)}>
                <div>
                    <p {...stylex.props(styles.sectionTitle)}>Venue</p>
                    <p {...stylex.props(styles.hint, typography.sm)}>
                        Optional. Street, city and country are required together.
                    </p>
                </div>

                {(
                    [
                        ["venue.label", "Venue name"],
                        ["venue.line1", "Street"],
                        ["venue.line2", "Street line 2"],
                        ["venue.city", "City"],
                        ["venue.region", "Region"],
                        ["venue.postalCode", "Postal code"],
                        ["venue.country", "Country"],
                    ] as const
                ).map(([name, label]) => (
                    <form.Field key={name} name={name}>
                        {(field) => (
                            <div {...stylex.props(styles.field)}>
                                <Label htmlFor={name}>{label}</Label>
                                <Input
                                    id={name}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(event) => field.handleChange(event.target.value)}
                                />
                            </div>
                        )}
                    </form.Field>
                ))}
            </div>
```

- [ ] **Step 6: Enforce all-or-nothing on the venue**

Add a form-level validator so a half-filled venue cannot be submitted. Pass this to `useForm`:

```tsx
        validators: {
            onSubmit: ({ value }: { value: EventFormValues }) => {
                if (venueIsEmpty(value.venue)) return undefined;

                const missing = (["line1", "city", "country"] as const).filter(
                    (key) => value.venue[key].trim() === "",
                );

                return missing.length > 0
                    ? { form: "Street, city and country are required when a venue is given." }
                    : undefined;
            },
        },
```

Import `venueIsEmpty` in the component:

```tsx
import { venueIsEmpty, type EventFormValues } from "@/lib/event-form";
```

Render the form-level error next to the submit banner by adding, just above `form.Subscribe`:

```tsx
            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                {(formError) =>
                    formError ? (
                        <p {...stylex.props(styles.error, typography.sm)}>{String(formError)}</p>
                    ) : null
                }
            </form.Subscribe>
```

- [ ] **Step 7: Resolve the address during submit**

In `apps/web/app/events/new/page.tsx`, change the mutation body:

```tsx
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);
            const addressId = await resolveAddressId(values, null, addressesApi);
            const input = toEventInput(values, { imageKey, addressId });

            return eventsApi.create(input);
        },
```

Update imports:

```tsx
import {
    emptyFormValues,
    resolveAddressId,
    resolveImageKey,
    toEventInput,
    type EventFormValues,
} from "@/lib/event-form";
import { addressesApi, eventKeys, eventsApi, uploadImage } from "@/lib/events";
```

- [ ] **Step 8: Verify by hand**

Create an event with a venue. Confirm the address row exists and is linked:

```bash
docker compose exec -T postgres psql -U postgres -d eventapp \
  -c 'SELECT e.name, a.city FROM "Event" e JOIN "Address" a ON a.id = e."addressId";'
```

Then create one with a city but no street; expect the form to block submission.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/components/event-form.tsx apps/web/app/events apps/web/app/lib
git commit -m "Add venue section to the event form"
```

---

### Task 8: Edit route, and retire the dialog

**Files:**
- Create: `apps/web/app/events/[id]/edit/page.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 5, 6, 7
- Produces: nothing downstream

- [ ] **Step 1: Write the edit route**

`apps/web/app/events/[id]/edit/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";

import { EventForm } from "@/components/event-form";
import { Card, CardContent } from "@/components/ui/card";
import {
    resolveAddressId,
    resolveImageKey,
    toEventInput,
    toFormValues,
    type EventFormValues,
} from "@/lib/event-form";
import { addressesApi, eventKeys, eventsApi, uploadImage } from "@/lib/events";
import { colors, typography } from "@/styles/tokens.stylex";

const spin = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: { default: "1rem", "@media (min-width: 640px)": "1.5rem" },
        paddingBlock: "3.5rem",
    },
    title: { fontSize: "1.875rem", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.025em" },
    header: { marginBottom: "1.75rem" },
    state: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        paddingBlock: "5rem",
        color: colors.mutedForeground,
    },
    spinner: {
        animationName: spin,
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
});

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: event, isPending, error } = useQuery({
        queryKey: eventKeys.detail(id),
        queryFn: () => eventsApi.get(id),
    });

    const updateEvent = useMutation({
        mutationFn: async (values: EventFormValues) => {
            const imageKey = await resolveImageKey(values, uploadImage);
            const addressId = await resolveAddressId(values, event?.addressId ?? null, addressesApi);
            const input = toEventInput(values, { imageKey, addressId });

            return eventsApi.update(id, input);
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: eventKeys.all }),
                queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) }),
            ]);
            router.push("/");
        },
    });

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <h1 {...stylex.props(styles.title)}>Edit event</h1>
                </div>

                <Card>
                    <CardContent>
                        {isPending ? (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                <Loader2Icon {...stylex.props(styles.spinner)} size={16} />
                                Loading…
                            </div>
                        ) : error || !event ? (
                            <div {...stylex.props(styles.state, typography.sm)}>
                                {error instanceof Error ? error.message : "Event not found"}
                            </div>
                        ) : (
                            <EventForm
                                initialValues={toFormValues(event)}
                                submitLabel="Save"
                                onCancel={() => router.push("/")}
                                onSubmit={async (values) => {
                                    await updateEvent.mutateAsync(values);
                                }}
                            />
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
```

**Two deliberate deviations from the spec, both narrower than they look:**

1. The spec says a missing event renders `notFound()`. This renders an inline
   error inside the page shell instead: the route is a client component whose
   data arrives after render, so `notFound()` would replace an already-painted
   page with the 404 shell. The inline state keeps the heading and card and
   reports the actual API message.
2. This sends the full input rather than only dirty fields. With a 1:1 venue and
   a single editor there is no clobbering risk, so full-send is correct and
   simpler. A dirty-diff belongs with concurrent editing, if that ever arrives.

- [ ] **Step 2: Remove the dialog from the list page**

In `apps/web/app/page.tsx`:

1. Delete the `<Dialog>…</Dialog>` block entirely.
2. Delete the state and handlers it used: `isFormOpen`, `editingEvent`, `name`, `saveMutation`, `openCreateForm`, `openEditForm`, `handleSubmit`.
3. Replace the row's edit `<Button onClick={() => openEditForm(event)}>` with a link:

```tsx
<Button
    variant="ghost"
    size="icon-sm"
    aria-label={`Edit ${event.name}`}
    render={<Link href={`/events/${event.id}/edit`} />}>
    <PencilIcon />
</Button>
```

4. Remove the now-unused imports: `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `Input`, `Label`, and `FormEvent`.
5. Keep the `AlertDialog` delete flow exactly as it is.

- [ ] **Step 3: Verify types and lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec biome lint .`
Expected: PASS. Unused imports are lint errors, so this catches an incomplete cleanup.

- [ ] **Step 4: Verify by hand**

Edit an existing event: change the name, add a description, change the venue city, replace the image. Confirm the list reflects all of it, and that the venue change updated the same address row rather than creating a second one:

```bash
docker compose exec -T postgres psql -U postgres -d eventapp -c 'SELECT count(*) FROM "Address";'
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/events apps/web/app/page.tsx
git commit -m "Add event edit route and remove the edit dialog"
```

---

### Task 9: End-to-end coverage

**Files:**
- Modify: `apps/e2e/tests/events.spec.ts`
- Create: `apps/e2e/fixtures/event.png`

- [ ] **Step 1: Create the image fixture**

```bash
mkdir -p apps/e2e/fixtures
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > apps/e2e/fixtures/event.png
```

- [ ] **Step 2: Replace the spec**

Replace `apps/e2e/tests/events.spec.ts` entirely:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const API_URL = "http://localhost:4000";
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/event.png");

/** Names are unique per run so specs don't collide with existing dev data. */
const uniqueName = (label: string) => `${label} ${Date.now()}`;

test("creates an event with every field, then edits and deletes it", async ({ page, request }) => {
    const name = uniqueName("E2E event");
    const renamed = `${name} (edited)`;

    await page.goto("/");
    await page.getByRole("button", { name: "New Event" }).click();
    await expect(page).toHaveURL(/\/events\/new$/);

    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Description").fill("Created by the e2e suite");
    await page.getByLabel("Starts").fill("2026-10-01T18:00");
    await page.getByLabel("Ends").fill("2026-10-01T21:00");
    await page.getByLabel("Image").setInputFiles(FIXTURE);

    await page.getByLabel("Street", { exact: true }).fill("1 Civic Square");
    await page.getByLabel("City").fill("Amsterdam");
    await page.getByLabel("Country").fill("NL");

    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await test.step("edit", async () => {
        await page.getByRole("button", { name: `Edit ${name}` }).click();
        await expect(page).toHaveURL(/\/edit$/);

        await page.getByLabel("Name", { exact: true }).fill(renamed);
        await page.getByRole("button", { name: "Save" }).click();

        await expect(page.getByRole("cell", { name: renamed, exact: true })).toBeVisible();
    });

    await test.step("delete", async () => {
        await page.getByRole("button", { name: `Delete ${renamed}` }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();

        await expect(page.getByRole("cell", { name: renamed, exact: true })).toBeHidden();
    });

    // Clean up anything the run left behind in the shared dev database.
    const response = await request.get(`${API_URL}/api/events`);
    const events: Array<{ id: string; name: string }> = await response.json();
    for (const event of events.filter((candidate) => candidate.name.startsWith("E2E event"))) {
        await request.delete(`${API_URL}/api/events/${event.id}`);
    }
});

test("blocks submitting without a name", async ({ page }) => {
    await page.goto("/events/new");

    await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
});

test("requires street, city and country together", async ({ page }) => {
    await page.goto("/events/new");

    await page.getByLabel("Name", { exact: true }).fill(uniqueName("Partial venue"));
    await page.getByLabel("City").fill("Amsterdam");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(/Street, city and country are required/)).toBeVisible();
    await expect(page).toHaveURL(/\/events\/new$/);
});
```

- [ ] **Step 3: Run the suite**

Run: `pnpm --filter e2e test:e2e`
Expected: PASS — 3 tests. The previously `fixme`d spec is gone, replaced by real coverage.

- [ ] **Step 4: Commit**

```bash
git add apps/e2e
git commit -m "Cover event create, edit and delete with e2e tests"
```

---

### Task 10: Build a DateTimePicker and use it for the event dates

The stylexui registry has **no** date-picker component — its `date-picker` entry
ships only `calendar.tsx` (a dates-only `react-day-picker` wrapper) plus
dependencies. A picker is composed by the consumer. Events need date **and**
time, so the time half is ours to build either way.

**Files:**
- Create: `apps/web/app/components/date-time-picker.tsx`
- Create: `apps/web/app/lib/date-time.ts`, `apps/web/app/lib/date-time.test.ts`
- Modify: `apps/web/app/components/event-form.tsx`

**Interfaces:**
- Consumes: `Calendar` and `Popover` from `@/components/ui/*` (vendored in Task 4)
- Produces: `<DateTimePicker id value onChange />` where `value: Date | null` and
  `onChange: (value: Date | null) => void`

- [ ] **Step 1: Write the failing test for the date/time merge**

The fiddly part is combining a date chosen on a calendar with a time typed in a
text field, without either clobbering the other. That is pure logic, so it is
tested on its own.

`apps/web/app/lib/date-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toTimeInput, withDate, withTime } from "./date-time";

describe("withTime", () => {
    it("sets the time on an existing date", () => {
        const result = withTime(new Date(2026, 9, 1, 9, 30), "18:45");

        expect(result?.getHours()).toBe(18);
        expect(result?.getMinutes()).toBe(45);
        expect(result?.getDate()).toBe(1);
    });

    it("returns null when there is no date yet", () => {
        expect(withTime(null, "18:45")).toBeNull();
    });

    it("ignores an incomplete time string", () => {
        const date = new Date(2026, 9, 1, 9, 30);

        expect(withTime(date, "")?.getHours()).toBe(9);
    });
});

describe("withDate", () => {
    it("keeps the existing time when the day changes", () => {
        const result = withDate(new Date(2026, 9, 1, 18, 45), new Date(2026, 9, 8));

        expect(result?.getDate()).toBe(8);
        expect(result?.getHours()).toBe(18);
        expect(result?.getMinutes()).toBe(45);
    });

    it("defaults to midnight when there was no previous value", () => {
        const result = withDate(null, new Date(2026, 9, 8));

        expect(result?.getHours()).toBe(0);
        expect(result?.getMinutes()).toBe(0);
    });

    it("clears the value when no day is given", () => {
        expect(withDate(new Date(2026, 9, 1), null)).toBeNull();
    });
});

describe("toTimeInput", () => {
    it("formats as zero-padded HH:mm", () => {
        expect(toTimeInput(new Date(2026, 9, 1, 9, 5))).toBe("09:05");
    });

    it("is empty for no date", () => {
        expect(toTimeInput(null)).toBe("");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web exec vitest run date-time`
Expected: FAIL — `Cannot find module './date-time'`

- [ ] **Step 3: Write the helpers**

`apps/web/app/lib/date-time.ts`:

```ts
/**
 * A calendar picks a day and a text field picks a time; these merge one into the
 * other without the second clobbering the first.
 */

const pad = (part: number) => String(part).padStart(2, "0");

/** "HH:mm" for an <input type="time">. */
export const toTimeInput = (value: Date | null) =>
    value ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : "";

/** Applies an "HH:mm" string to an existing date, keeping the day. */
export const withTime = (value: Date | null, time: string): Date | null => {
    if (!value) return null;

    const [hours, minutes] = time.split(":").map(Number);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;

    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);

    return next;
};

/** Applies a chosen day to an existing value, keeping the time already set. */
export const withDate = (value: Date | null, day: Date | null): Date | null => {
    if (!day) return null;

    const next = new Date(day);
    next.setHours(value?.getHours() ?? 0, value?.getMinutes() ?? 0, 0, 0);

    return next;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run date-time`
Expected: PASS — 8 tests

- [ ] **Step 5: Build the component**

Check the vendored components' real APIs first — the exact export names and props
come from Task 4's report, and the code below assumes `Calendar` accepts
react-day-picker's `mode="single"`, `selected` and `onSelect`, and that Popover
exposes root/trigger/content parts:

Run: `grep -nE "^export" apps/web/app/components/ui/calendar.tsx apps/web/app/components/ui/popover.tsx`

`apps/web/app/components/date-time-picker.tsx`:

```tsx
"use client";

import * as stylex from "@stylexjs/stylex";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toTimeInput, withDate, withTime } from "@/lib/date-time";
import { colors, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    row: { display: "flex", gap: "0.5rem" },
    trigger: { flex: 1, justifyContent: "flex-start", gap: "0.5rem" },
    placeholder: { color: colors.mutedForeground },
    time: { width: "8rem" },
    content: { padding: "0.5rem" },
});

const formatDay = (value: Date) =>
    value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export type DateTimePickerProps = {
    id: string;
    value: Date | null;
    onChange: (value: Date | null) => void;
};

export function DateTimePicker({ id, value, onChange }: DateTimePickerProps) {
    return (
        <div {...stylex.props(styles.row)}>
            <Popover>
                <PopoverTrigger
                    render={
                        <Button id={id} type="button" variant="outline" style={styles.trigger}>
                            <CalendarIcon size={16} />
                            {value ? (
                                formatDay(value)
                            ) : (
                                <span {...stylex.props(styles.placeholder)}>Pick a date</span>
                            )}
                        </Button>
                    }
                />
                <PopoverContent style={styles.content}>
                    <Calendar
                        mode="single"
                        selected={value ?? undefined}
                        onSelect={(day: Date | undefined) => onChange(withDate(value, day ?? null))}
                    />
                </PopoverContent>
            </Popover>

            <Input
                type="time"
                aria-label="Time"
                style={styles.time}
                value={toTimeInput(value)}
                disabled={!value}
                onChange={(event) => onChange(withTime(value, event.target.value))}
            />
        </div>
    );
}
```

If Task 4's report shows different prop names for Calendar or Popover, adapt these
two call sites to match — the component's own `value`/`onChange` contract does not
change.

- [ ] **Step 6: Use it for both date fields**

In `apps/web/app/components/event-form.tsx`, add the import:

```tsx
import { DateTimePicker } from "@/components/date-time-picker";
```

Replace the body of the `startsAt` field:

```tsx
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="startsAt">Starts</Label>
                            <DateTimePicker
                                id="startsAt"
                                value={field.state.value}
                                onChange={(value) => field.handleChange(value)}
                            />
                        </div>
```

And the `endsAt` field identically, with `id="endsAt"` and `Ends` as the label.

- [ ] **Step 7: Delete the now-unused local-time helpers**

Remove `toLocalInput` and `fromLocalInput` from the bottom of `event-form.tsx`.
Biome reports unused declarations, so lint confirms they are gone.

- [ ] **Step 8: Verify**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec biome lint . && pnpm --filter web exec vitest run && pnpm --filter web build`
Expected: all PASS

With `pnpm dev` running, set both dates on `/events/new` — pick a day in the
popover, type a time — submit, and confirm what was stored:

```bash
docker compose exec -T postgres psql -U postgres -d eventapp \
  -c 'SELECT name, "startsAt", "endsAt" FROM "Event" ORDER BY "createdAt" DESC LIMIT 1;'
```

Expected: the timestamps match the day and time picked, stored in UTC.

- [ ] **Step 9: Update the e2e spec for the new control**

Task 9's spec fills dates with `getByLabel("Starts").fill(...)`, which only works
on a native input. Drive the new control instead — open the popover from the
"Starts" button, choose a day by its accessible name, then fill the adjacent
"Time" field:

Run: `pnpm --filter e2e test:e2e`
Expected: PASS — 3 tests

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/components apps/web/app/lib apps/e2e
git commit -m "Add a date-time picker composed from popover and calendar"
```

---

### Task 11: Documentation

**Files:**
- Modify: `docs/architecture.md`, `docs/typescript-conventions.md`, `docs/testing-conventions.md`, `AGENTS.md`

- [ ] **Step 1: Document the contracts package**

In `docs/architecture.md`, add `contracts/` to the layout table under `packages/`:

```
  contracts/  Zod schemas shared by the API and web app
```

And add this section after "API module layering":

```markdown
## Shared contracts

Request validation lives in `@repo/contracts`, not in either app. The package
exports two schemas per resource, derived from one field shape: a wire schema
(ISO date strings) that the browser form validates against, and a payload schema
(coerced `Date` objects) that the API parses request bodies with. The API's
`*.schema.ts` files are thin re-exports, so the module layering is unchanged.

The server remains authoritative. Client-side validation is a UX improvement,
never the security boundary.
```

- [ ] **Step 2: Note the rule in the TypeScript conventions**

Append to the "Rules" list in `docs/typescript-conventions.md`:

```markdown
- Request/response schemas belong in `@repo/contracts`, never duplicated per app.
  Derive types with `z.infer` rather than hand-writing them.
```

- [ ] **Step 3: Update the testing conventions**

In `docs/testing-conventions.md`, replace the E2E bullet about naming fixtures with:

```markdown
- Name fixtures uniquely per run and clean up afterwards; specs run against the
  development database, not a dedicated one. The events spec deletes anything it
  created via the API at the end of the run.
```

- [ ] **Step 4: Link the spec from AGENTS.md**

Under the docs list in `AGENTS.md`, add:

```markdown
- [docs/superpowers/specs/](docs/superpowers/specs/) — design specs for larger features
```

- [ ] **Step 5: Verify the whole repo**

Run:

```bash
pnpm check-types && pnpm lint && pnpm test && pnpm --filter e2e test:e2e
```

Expected: all pass. API tests need Postgres up.

- [ ] **Step 6: Commit**

```bash
git add docs AGENTS.md
git commit -m "Document the shared contracts package"
```

---

## Done when

- `/events/new` creates an event with name, description, dates, image and venue
- `/events/[id]/edit` edits all of the above, updating the venue in place
- The list page has no dialog; rows link to the edit route
- `pnpm check-types`, `pnpm lint`, `pnpm test` and `pnpm --filter e2e test:e2e` all pass
- The partial-failure limitation stays documented in the spec, unresolved by design
