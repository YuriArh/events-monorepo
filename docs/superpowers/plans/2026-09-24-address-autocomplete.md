# Address Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the event form's seven manual venue inputs with a single address search box backed by Photon, storing the geocoder's full response alongside the structured fields it yields.

**Architecture:** A new `geocoding` module in the Fastify API proxies Photon — it is the only place that knows the upstream URL, sets a `User-Agent`, caches, bounds concurrency and filters unusable results. The web app calls `GET /api/geocode` through TanStack Query and renders a Base UI `Autocomplete`. The `Address` table gains `lat`/`lon`/`osmId`/`raw` by an additive-only migration.

**Tech Stack:** Fastify 5, Zod 4 (`@repo/contracts`), Prisma 7 / Postgres, Next.js 16 App Router, React 19, TanStack Query 5, TanStack Form, Base UI 1.8 `Autocomplete`, StyleX, Vitest 5, Playwright.

## Global Constraints

- **Styling is StyleX only.** Tailwind was deliberately removed: no Tailwind class names, no `className` utility strings. Tokens come from `@/styles/tokens.stylex`.
- `apps/web/app/components/ui/**` is vendored registry code: use it, never hand-edit it.
- `packages/contracts/src/index.ts` must contain **no relative imports** — the API compiles it under NodeNext (which demands `.js` extensions) while Turbopack cannot resolve those to `.ts`. It stays one module.
- The server is authoritative. Client-side validation is UX only, never the security boundary.
- Event↔Address is 1:1: `Event.addressId` is `String? @unique`, `onDelete: SetNull`.
- `line1`, `city` and `country` stay `NOT NULL`. Results that cannot fill all three are filtered out server-side.
- **There is no manual address entry.** The raw search text is never saved as an address; the only recourse for a failed search is searching again.
- A geocoder failure must never block saving an event — the venue is optional.
- No test may call the real Photon service.
- Migrations are additive only: no dropped columns, no tightened nullability.

---

## File Structure

**Created:**
- `apps/api/src/modules/geocoding/geocode.routes.ts` — one `GET /` route, maps upstream failure to 503.
- `apps/api/src/modules/geocoding/geocode.service.ts` — upstream fetch, cache, in-flight dedupe.
- `apps/api/src/modules/geocoding/geocode.mapper.ts` — pure filter/normalise logic, no I/O.
- `apps/api/src/modules/geocoding/geocode.mapper.test.ts`
- `apps/api/src/modules/geocoding/geocode.routes.test.ts`
- `apps/api/src/modules/geocoding/geocode.schema.ts` — thin re-export from contracts.
- `apps/api/src/modules/geocoding/geocode.types.ts`
- `apps/web/app/lib/api.ts` — `ApiError` + `request`, extracted so two clients share them.
- `apps/web/app/lib/geocode.ts` — `geocodeApi`, `geocodeKeys`, `emptyStateMessage`.
- `apps/web/app/lib/geocode.test.ts`
- `apps/web/app/lib/use-debounced-value.ts`
- `apps/web/app/components/address-search.tsx`

**Modified:**
- `packages/contracts/src/index.ts` — geocode schemas; `createAddressInput` gains `lat`/`lon`/`osmId`/`raw`.
- `packages/db/prisma/schema.prisma` + a new migration.
- `apps/api/src/app.ts` — register `geocodeRoutes`.
- `apps/api/src/modules/addresses/address.repository.ts` — `Prisma.DbNull` handling for `raw`.
- `apps/web/app/lib/events.ts` — import `request`/`ApiError` from `./api`, re-export `ApiError`.
- `apps/web/app/lib/event-form.ts` — `venue: VenueValues` becomes `address: AddressSelection | null`.
- `apps/web/app/components/event-form.tsx` — seven inputs out, `AddressSearch` in.
- `apps/e2e/tests/events.spec.ts` — drive the combobox; delete the all-or-nothing test.
- `docs/architecture.md`, `docs/testing-conventions.md`.

---

### Task 1: Contracts — geocode schemas and the new address fields

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `docs/superpowers/specs/2026-09-24-address-autocomplete-design.md`
- Test: `packages/contracts/src/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `geocodeQuery`, `geocodeSuggestion`, `geocodeResponse`, and their inferred types `GeocodeQuery`, `GeocodeSuggestion`, `GeocodeResponse`; `createAddressInput` extended with `lat`, `lon`, `osmId`, `raw`.

**Note on a spec deviation you are implementing deliberately:** the spec's contract block lists both `id` and `osmId` on a suggestion, which are the same value (`${osm_type}${osm_id}`). Carrying both is dead duplication a reviewer would rightly flag, so this plan keeps **only `osmId`** and uses it as the React key. Step 5 updates the spec so the two agree — do not skip it.

- [ ] **Step 1: Write the failing tests**

Append to `packages/contracts/src/index.test.ts`:

```ts
describe("geocodeQuery", () => {
    it("coerces the limit from a query string and defaults it", () => {
        expect(geocodeQuery.parse({ q: "Nieuwmarkt" })).toEqual({ q: "Nieuwmarkt", limit: 8 });
        expect(geocodeQuery.parse({ q: "Nieuwmarkt", limit: "5" }).limit).toBe(5);
    });

    it("rejects a query shorter than three characters", () => {
        expect(geocodeQuery.safeParse({ q: "ni" }).success).toBe(false);
    });

    it("rejects a limit above ten", () => {
        expect(geocodeQuery.safeParse({ q: "Nieuwmarkt", limit: 50 }).success).toBe(false);
    });
});

describe("geocodeResponse", () => {
    const suggestion = {
        display: "Nieuwmarkt 4, Amsterdam, Netherlands",
        line1: "Nieuwmarkt 4",
        city: "Amsterdam",
        region: "North Holland",
        postalCode: "1012 CR",
        country: "Netherlands",
        lat: 52.3723,
        lon: 4.9002,
        osmId: "W123456",
        raw: { type: "Feature" },
    };

    it("accepts a filtered count alongside suggestions", () => {
        const parsed = geocodeResponse.parse({ suggestions: [suggestion], filtered: 3 });

        expect(parsed.suggestions[0]?.osmId).toBe("W123456");
        expect(parsed.filtered).toBe(3);
    });

    it("rejects a suggestion missing a required structured field", () => {
        const { city, ...withoutCity } = suggestion;

        expect(geocodeResponse.safeParse({ suggestions: [withoutCity], filtered: 0 }).success).toBe(
            false,
        );
    });
});

describe("createAddressInput geocoding fields", () => {
    it("accepts coordinates and the raw feature", () => {
        const parsed = createAddressInput.parse({
            line1: "Nieuwmarkt 4",
            city: "Amsterdam",
            country: "Netherlands",
            lat: 52.3723,
            lon: 4.9002,
            osmId: "W123456",
            raw: { type: "Feature", properties: { city: "Amsterdam" } },
        });

        expect(parsed.lat).toBe(52.3723);
        expect(parsed.osmId).toBe("W123456");
    });

    it("still accepts an address with no geocoding fields at all", () => {
        const parsed = createAddressInput.parse({
            line1: "1 Civic Square",
            city: "Amsterdam",
            country: "NL",
        });

        expect(parsed.lat ?? null).toBeNull();
    });
});
```

Add `geocodeQuery`, `geocodeResponse` to the existing import from `./index` at the top of that test file (`createAddressInput` is likely already imported; check before adding a duplicate).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/contracts test`
Expected: FAIL — `geocodeQuery is not defined`.

- [ ] **Step 3: Extend the contracts module**

In `packages/contracts/src/index.ts`, replace the existing `createAddressInput` declaration with:

```ts
/** line1, city and country are NOT NULL in the database. */
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
```

Then append a new section at the end of the file:

```ts
// ---------------------------------------------------------------- geocoding

export const geocodeQuery = z.object({
  // Three characters is the floor: shorter queries match half a country and
  // waste an upstream call.
  q: z.string().min(3).max(200),
  // Arrives as a string on the query string, hence coerce.
  limit: z.coerce.number().int().min(1).max(10).default(8),
});

/**
 * One selectable address. Only results that can fill line1, city and country
 * ever become a suggestion — see the geocoding mapper — because those columns
 * are NOT NULL and there is no manual entry to fall back on.
 */
export const geocodeSuggestion = z.object({
  /** `${osm_type}${osm_id}`, e.g. "W123456". Stable per place; used as the key. */
  osmId: z.string().min(1).max(64),
  /** What the dropdown shows: "Nieuwmarkt 4, Amsterdam, Netherlands". */
  display: z.string().min(1),
  line1: z.string().min(1).max(255),
  city: z.string().min(1).max(255),
  region: z.string().max(255).nullable(),
  postalCode: z.string().max(32).nullable(),
  country: z.string().min(1).max(255),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** The complete Photon feature, passed through verbatim. */
  raw: z.unknown(),
});

export const geocodeResponse = z.object({
  suggestions: z.array(geocodeSuggestion),
  /**
   * How many upstream results the filter dropped. The browser cannot work this
   * out for itself because filtering happens server-side, and it needs it to
   * tell "nothing matched" apart from "matches existed but none were usable" —
   * two different messages to the user.
   */
  filtered: z.number().int().min(0),
});

export type GeocodeQuery = z.infer<typeof geocodeQuery>;
export type GeocodeSuggestion = z.infer<typeof geocodeSuggestion>;
export type GeocodeResponse = z.infer<typeof geocodeResponse>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @repo/contracts test`
Expected: PASS.

- [ ] **Step 5: Align the spec with the contract**

In `docs/superpowers/specs/2026-09-24-address-autocomplete-design.md`, in the `geocodeSuggestion` block, delete the `id: string,` line and change the `osmId: string,` line to read:

```
  osmId: string,      // `${osm_type}${osm_id}` — stable per place, used as the key
```

- [ ] **Step 6: Verify types across the monorepo**

Run: `pnpm check-types`
Expected: PASS. (Both resolvers must still accept the contracts package.)

- [ ] **Step 7: Commit**

```bash
git add packages/contracts docs/superpowers/specs
git commit -m "Add geocoding contracts and address coordinate fields"
```

---

### Task 2: Migration — Address gains lat, lon, osmId and raw

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_address_geocoding/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Address.lat: Float?`, `Address.lon: Float?`, `Address.osmId: String?`, `Address.raw: Json?`.

**Why this is additive only:** this repo has lost a development database to a destructive migration before. Every column here is nullable and new. Nothing is dropped, no nullability is tightened, no type changes. It cannot fail against existing rows.

- [ ] **Step 1: Edit the schema**

In `packages/db/prisma/schema.prisma`, inside `model Address`, add these four fields immediately after `country`:

```prisma
  // Populated from the Photon result that produced this address. Null for
  // addresses created before geocoding existed.
  lat   Float?
  lon   Float?
  osmId String?
  raw   Json?
```

Leave `label`, `line1`, `city`, `country`, the `event` relation and `@@index([city])` exactly as they are.

- [ ] **Step 2: Generate the migration without applying it**

```bash
cd packages/db
pnpm exec prisma migrate dev --name add_address_geocoding --create-only
```

- [ ] **Step 3: Read the generated SQL before applying it**

```bash
cat packages/db/prisma/migrations/*_add_address_geocoding/migration.sql
```

Expected: only `ALTER TABLE "Address" ADD COLUMN` statements, four of them, every one nullable. **If you see `DROP`, `NOT NULL`, or any statement touching another table, stop and report BLOCKED** — that means the schema drifted and applying it would lose data.

- [ ] **Step 4: Apply the migration**

```bash
cd packages/db && pnpm exec prisma migrate dev
```

- [ ] **Step 5: Verify the columns exist and existing rows survived**

```bash
docker compose exec -T postgres psql -U postgres -d eventapp \
  -c '\d "Address"' \
  -c 'SELECT count(*) AS addresses, count(lat) AS with_coords FROM "Address";'
```

Expected: the four new columns are listed and nullable; `addresses` matches what was there before (6 at the time of writing) and `with_coords` is 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "Add geocoding columns to Address"
```

---

### Task 3: Geocoding mapper — pure filter and normalise logic

**Files:**
- Create: `apps/api/src/modules/geocoding/geocode.mapper.ts`
- Test: `apps/api/src/modules/geocoding/geocode.mapper.test.ts`

**Interfaces:**
- Consumes: `GeocodeSuggestion` from `@repo/contracts` (Task 1).
- Produces: `toSuggestion(feature: PhotonFeature): GeocodeSuggestion | null` and `mapFeatures(features: PhotonFeature[]): { suggestions: GeocodeSuggestion[]; filtered: number }`, plus the exported type `PhotonFeature`.

This is where all the fiddly logic lives, deliberately separated from I/O so it is covered by plain unit tests.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/geocoding/geocode.mapper.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mapFeatures, toSuggestion, type PhotonFeature } from "./geocode.mapper.js";

const feature = (properties: Record<string, unknown>, coordinates = [4.9002, 52.3723]): PhotonFeature => ({
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties,
});

const complete = {
    osm_type: "W",
    osm_id: 123456,
    street: "Nieuwmarkt",
    housenumber: "4",
    city: "Amsterdam",
    state: "North Holland",
    postcode: "1012 CR",
    country: "Netherlands",
};

describe("toSuggestion", () => {
    it("maps a complete feature", () => {
        const result = toSuggestion(feature(complete));

        expect(result).toEqual({
            osmId: "W123456",
            display: "Nieuwmarkt 4, Amsterdam, Netherlands",
            line1: "Nieuwmarkt 4",
            city: "Amsterdam",
            region: "North Holland",
            postalCode: "1012 CR",
            country: "Netherlands",
            lat: 52.3723,
            lon: 4.9002,
            raw: feature(complete),
        });
    });

    it("omits the house number when there isn't one", () => {
        const { housenumber, ...withoutNumber } = complete;

        expect(toSuggestion(feature(withoutNumber))?.line1).toBe("Nieuwmarkt");
    });

    it("nulls the optional fields rather than dropping the result", () => {
        const { state, postcode, ...sparse } = complete;
        const result = toSuggestion(feature(sparse));

        expect(result?.region).toBeNull();
        expect(result?.postalCode).toBeNull();
    });

    // These three are the whole reason the filter exists: line1, city and
    // country are NOT NULL and there is no manual entry to fall back on.
    it.each(["street", "city", "country"])("rejects a feature with no %s", (key) => {
        const { [key]: _removed, ...incomplete } = complete;

        expect(toSuggestion(feature(incomplete))).toBeNull();
    });

    it("rejects a feature with no usable coordinates", () => {
        expect(toSuggestion(feature(complete, []))).toBeNull();
    });

    it("rejects a feature whose fields are blank rather than absent", () => {
        expect(toSuggestion(feature({ ...complete, city: "   " }))).toBeNull();
    });
});

describe("mapFeatures", () => {
    it("counts what it dropped", () => {
        const { street, ...noStreet } = complete;

        const result = mapFeatures([
            feature(complete),
            feature(noStreet),
            feature({ ...noStreet, name: "Vondelpark" }),
        ]);

        expect(result.suggestions).toHaveLength(1);
        expect(result.filtered).toBe(2);
    });

    it("deduplicates by osm id, keeping upstream order", () => {
        const result = mapFeatures([
            feature(complete),
            feature({ ...complete, street: "Nieuwmarkt", housenumber: "4" }),
            feature({ ...complete, osm_id: 999, street: "Damrak", housenumber: "1" }),
        ]);

        expect(result.suggestions.map((item) => item.osmId)).toEqual(["W123456", "W999"]);
        // A duplicate is not a filtered-out result — it was usable, just repeated.
        expect(result.filtered).toBe(0);
    });

    it("returns an empty result for no features", () => {
        expect(mapFeatures([])).toEqual({ suggestions: [], filtered: 0 });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec vitest run geocode.mapper`
Expected: FAIL — cannot find module `./geocode.mapper.js`.

- [ ] **Step 3: Write the mapper**

`apps/api/src/modules/geocoding/geocode.mapper.ts`:

```ts
import type { GeocodeSuggestion } from "@repo/contracts";

/** The shape Photon actually returns. Everything is optional: property sets
 *  vary wildly by place type, which is what the filter below exists for. */
export type PhotonFeature = {
  type?: string;
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
};

/** A present, non-blank string, or null. Photon omits keys and also ships
 *  whitespace-only values; both mean "absent" here. */
const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Maps one Photon feature to a suggestion, or null when it cannot fill the
 * three NOT NULL columns (line1, city, country) or has no coordinates.
 */
export const toSuggestion = (feature: PhotonFeature): GeocodeSuggestion | null => {
  const properties = feature.properties ?? {};

  const street = text(properties.street);
  const city = text(properties.city);
  const country = text(properties.country);

  if (!street || !city || !country) {
    return null;
  }

  const coordinates = feature.geometry?.coordinates;

  // GeoJSON orders coordinates [lon, lat], not [lat, lon].
  const lon = coordinates?.[0];
  const lat = coordinates?.[1];

  if (typeof lon !== "number" || typeof lat !== "number") {
    return null;
  }

  const osmType = text(properties.osm_type);
  const osmId = properties.osm_id;

  if (!osmType || (typeof osmId !== "number" && typeof osmId !== "string")) {
    return null;
  }

  const housenumber = text(properties.housenumber);
  const line1 = housenumber ? `${street} ${housenumber}` : street;

  return {
    osmId: `${osmType}${osmId}`,
    display: [line1, city, country].join(", "),
    line1,
    city,
    region: text(properties.state),
    postalCode: text(properties.postcode),
    country,
    lat,
    lon,
    raw: feature,
  };
};

/**
 * Maps a whole feature collection, reporting how many were dropped so the form
 * can tell "nothing matched" from "nothing usable matched".
 *
 * Duplicates do not count as filtered: they were usable, merely repeated.
 */
export const mapFeatures = (
  features: PhotonFeature[],
): { suggestions: GeocodeSuggestion[]; filtered: number } => {
  const suggestions: GeocodeSuggestion[] = [];
  const seen = new Set<string>();
  let filtered = 0;

  for (const feature of features) {
    const suggestion = toSuggestion(feature);

    if (!suggestion) {
      filtered += 1;
      continue;
    }

    if (seen.has(suggestion.osmId)) {
      continue;
    }

    seen.add(suggestion.osmId);
    suggestions.push(suggestion);
  }

  return { suggestions, filtered };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api exec vitest run geocode.mapper`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/geocoding
git commit -m "Add the Photon result mapper"
```

---

### Task 4: Geocoding service and route

**Files:**
- Create: `apps/api/src/modules/geocoding/geocode.service.ts`
- Create: `apps/api/src/modules/geocoding/geocode.schema.ts`
- Create: `apps/api/src/modules/geocoding/geocode.types.ts`
- Create: `apps/api/src/modules/geocoding/geocode.routes.ts`
- Test: `apps/api/src/modules/geocoding/geocode.routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `mapFeatures`, `PhotonFeature` (Task 3); `geocodeQuery`, `GeocodeResponse` (Task 1).
- Produces: `GET /api/geocode?q=&limit=` returning `GeocodeResponse`; `geocodeService.search(q, limit)`; `geocodeService.clearCache()` for tests; `GeocodeUpstreamError`.

- [ ] **Step 1: Write the failing route tests**

`apps/api/src/modules/geocoding/geocode.routes.test.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../app.js";
import { geocodeService } from "./geocode.service.js";

let app: FastifyInstance;

const fetchMock = vi.fn();

const photonFeature = (properties: Record<string, unknown>) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [4.9002, 52.3723] },
    properties,
});

const COMPLETE = {
    osm_type: "W",
    osm_id: 123456,
    street: "Nieuwmarkt",
    housenumber: "4",
    city: "Amsterdam",
    country: "Netherlands",
};

const photonResponse = (features: unknown[]) =>
    new Response(JSON.stringify({ type: "FeatureCollection", features }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

const search = (query: string) => app.inject({ method: "GET", url: `/api/geocode?${query}` });

beforeAll(async () => {
    app = buildApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // The cache is process-wide; without this a test sees the previous one's result.
    geocodeService.clearCache();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("GET /api/geocode", () => {
    it("returns mapped suggestions", async () => {
        fetchMock.mockResolvedValue(photonResponse([photonFeature(COMPLETE)]));

        const response = await search("q=Nieuwmarkt");
        const body = response.json<{ suggestions: Array<{ display: string }>; filtered: number }>();

        expect(response.statusCode).toBe(200);
        expect(body.suggestions[0]?.display).toBe("Nieuwmarkt 4, Amsterdam, Netherlands");
        expect(body.filtered).toBe(0);
    });

    it("reports how many results were unusable", async () => {
        const { street, ...noStreet } = COMPLETE;
        fetchMock.mockResolvedValue(
            photonResponse([photonFeature({ ...noStreet, name: "Vondelpark" })]),
        );

        const body = (await search("q=Vondelpark")).json<{
            suggestions: unknown[];
            filtered: number;
        }>();

        expect(body.suggestions).toEqual([]);
        expect(body.filtered).toBe(1);
    });

    it("identifies this application to the upstream service", async () => {
        fetchMock.mockResolvedValue(photonResponse([]));

        await search("q=Nieuwmarkt");

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;

        expect(headers["User-Agent"]).toMatch(/eventapp/);
    });

    it("serves a repeated query from cache without calling upstream again", async () => {
        fetchMock.mockResolvedValue(photonResponse([photonFeature(COMPLETE)]));

        await search("q=Nieuwmarkt");
        await search("q=Nieuwmarkt");

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a query shorter than three characters", async () => {
        const response = await search("q=ni");

        expect(response.statusCode).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 503 when the upstream service fails", async () => {
        fetchMock.mockRejectedValue(new Error("network down"));

        const response = await search("q=Nieuwmarkt");

        expect(response.statusCode).toBe(503);
        expect(response.json<{ message: string }>().message).toMatch(/unavailable/i);
    });

    it("returns 503 when the upstream service answers with an error status", async () => {
        fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

        expect((await search("q=Nieuwmarkt")).statusCode).toBe(503);
    });

    it("does not cache a failure", async () => {
        fetchMock.mockRejectedValueOnce(new Error("network down"));
        fetchMock.mockResolvedValue(photonResponse([photonFeature(COMPLETE)]));

        expect((await search("q=Nieuwmarkt")).statusCode).toBe(503);
        expect((await search("q=Nieuwmarkt")).statusCode).toBe(200);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec vitest run geocode.routes`
Expected: FAIL — cannot find module `./geocode.service.js`.

- [ ] **Step 3: Write the service**

`apps/api/src/modules/geocoding/geocode.service.ts`:

```ts
import type { GeocodeResponse } from "@repo/contracts";

import { mapFeatures, type PhotonFeature } from "./geocode.mapper.js";

/** Overridable so a self-hosted Photon is a config change, not a code change. */
const PHOTON_URL = process.env.PHOTON_URL ?? "https://photon.komoot.io/api";

/**
 * Photon asks callers to be fair and throttles extensive use. Identifying the
 * application is the minimum courtesy, and a browser cannot set this header —
 * which is the main reason this proxy exists at all.
 */
const USER_AGENT = "eventapp/1.0 (+https://github.com/YuriArh/events-monorepo)";

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 500;

export class GeocodeUpstreamError extends Error {
  readonly statusCode = 503;

  constructor(cause?: unknown) {
    super("Address lookup is unavailable right now.");
    this.name = "GeocodeUpstreamError";
    this.cause = cause;
  }
}

type CacheEntry = { value: GeocodeResponse; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** Collapses concurrent identical queries — several people typing the same
 *  street produce one upstream call, not one each. */
const inFlight = new Map<string, Promise<GeocodeResponse>>();

const cacheKey = (q: string, limit: number) => `${q.trim().toLowerCase()}|${limit}`;

const readCache = (key: string): GeocodeResponse | null => {
  const entry = cache.get(key);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
};

const writeCache = (key: string, value: GeocodeResponse) => {
  // Bounded, oldest-first. Address data barely moves, so a plain cap is enough;
  // an LRU would buy nothing here.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

const fetchFromPhoton = async (q: string, limit: number): Promise<GeocodeResponse> => {
  const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=${limit}`;

  let response: Response;

  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // A hanging upstream must not hold our request open.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new GeocodeUpstreamError(error);
  }

  if (!response.ok) {
    throw new GeocodeUpstreamError(`Photon responded ${response.status}`);
  }

  let body: { features?: PhotonFeature[] };

  try {
    body = (await response.json()) as { features?: PhotonFeature[] };
  } catch (error) {
    throw new GeocodeUpstreamError(error);
  }

  return mapFeatures(body.features ?? []);
};

export const geocodeService = {
  async search(q: string, limit: number): Promise<GeocodeResponse> {
    const key = cacheKey(q, limit);

    const cached = readCache(key);
    if (cached) return cached;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = fetchFromPhoton(q, limit)
      .then((value) => {
        // Only successes are cached: a transient outage must not be remembered
        // for an hour.
        writeCache(key, value);
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, request);

    return request;
  },

  /** Test seam: the cache is process-wide and would leak between tests. */
  clearCache() {
    cache.clear();
    inFlight.clear();
  },
};
```

- [ ] **Step 4: Write the schema, types and route**

`apps/api/src/modules/geocoding/geocode.schema.ts`:

```ts
export { geocodeQuery as geocodeQuerySchema } from "@repo/contracts";
```

`apps/api/src/modules/geocoding/geocode.types.ts`:

```ts
import type { z } from "@repo/contracts";

import type { geocodeQuerySchema } from "./geocode.schema.js";

export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;
```

`apps/api/src/modules/geocoding/geocode.routes.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";

import { geocodeQuerySchema } from "./geocode.schema.js";
import { GeocodeUpstreamError, geocodeService } from "./geocode.service.js";

export const geocodeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const { q, limit } = geocodeQuerySchema.parse(request.query);

    try {
      return await geocodeService.search(q, limit);
    } catch (error) {
      // The shared error handler only passes 4xx through, so 503 is mapped here.
      if (error instanceof GeocodeUpstreamError) {
        return reply.status(503).send({ message: error.message });
      }

      throw error;
    }
  });
};
```

- [ ] **Step 5: Register the route**

In `apps/api/src/app.ts`, add the import beside the existing route imports:

```ts
import { geocodeRoutes } from "./modules/geocoding/geocode.routes.js";
```

and register it beside the others:

```ts
  app.register(geocodeRoutes, { prefix: "/api/geocode" });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter api exec vitest run geocode.routes`
Expected: PASS — 8 tests.

- [ ] **Step 7: Run the whole API suite**

Run: `pnpm --filter api test`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "Add the geocoding proxy route"
```

---

### Task 5: Address repository handles the raw JSON column

**Files:**
- Modify: `apps/api/src/modules/addresses/address.repository.ts`
- Test: `apps/api/src/modules/addresses/address.routes.test.ts`

**Interfaces:**
- Consumes: `createAddressInput` with `raw` (Task 1); `Address.raw` (Task 2).
- Produces: addresses that round-trip `lat`/`lon`/`osmId`/`raw`.

**The trap this task exists for:** Prisma treats `null` on a nullable `Json` column as ambiguous — it cannot tell "SQL NULL" from "the JSON value `null`" — so passing `null` straight through is a type error. The fix is `Prisma.DbNull`. Without this the API will not compile the moment a caller omits `raw`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/addresses/address.routes.test.ts`:

```ts
describe("geocoded addresses", () => {
    it("round-trips coordinates and the raw feature", async () => {
        const raw = { type: "Feature", properties: { osm_id: 123456 } };

        const created = await app.inject({
            method: "POST",
            url: "/api/addresses",
            headers: { "content-type": "application/json" },
            payload: {
                line1: "Nieuwmarkt 4",
                city: "Amsterdam",
                country: "Netherlands",
                lat: 52.3723,
                lon: 4.9002,
                osmId: "W123456",
                raw,
            },
        });

        expect(created.statusCode).toBe(201);

        const body = created.json<{ id: string; lat: number; osmId: string; raw: unknown }>();

        expect(body.lat).toBe(52.3723);
        expect(body.osmId).toBe("W123456");
        expect(body.raw).toEqual(raw);
    });

    // Addresses created before geocoding existed have no raw feature, and
    // Prisma needs DbNull rather than null for a nullable Json column.
    it("stores an address with no geocoding fields", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/api/addresses",
            headers: { "content-type": "application/json" },
            payload: { line1: "1 Civic Square", city: "Amsterdam", country: "NL" },
        });

        expect(created.statusCode).toBe(201);

        const body = created.json<{ lat: number | null; raw: unknown }>();

        expect(body.lat).toBeNull();
        expect(body.raw).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api exec vitest run address.routes`
Expected: FAIL — the raw feature comes back as `null`, or the API fails to compile.

- [ ] **Step 3: Read the repository before changing it**

```bash
cat apps/api/src/modules/addresses/address.repository.ts
```

- [ ] **Step 4: Map `raw` through `Prisma.DbNull`**

In `apps/api/src/modules/addresses/address.repository.ts`, import the Prisma namespace alongside the existing `prisma` import:

```ts
import { Prisma, prisma } from "@repo/db";
```

Add this helper above the repository object:

```ts
/**
 * Prisma cannot tell "SQL NULL" from "the JSON value null" on a nullable Json
 * column, so it refuses a bare `null` and wants `Prisma.DbNull` instead.
 */
const rawForWrite = (raw: unknown) =>
  raw === undefined || raw === null ? Prisma.DbNull : (raw as Prisma.InputJsonValue);
```

Then in both `create` and `update`, spread the input and override `raw`:

```ts
  create(input: CreateAddressInput) {
    return prisma.address.create({
      data: { ...input, raw: rawForWrite(input.raw) },
    });
  },

  update(id: string, input: UpdateAddressInput) {
    return prisma.address.update({
      where: { id },
      data: { ...input, raw: rawForWrite(input.raw) },
    });
  },
```

Keep the rest of the file as it is. If the existing methods name their parameters differently, keep the existing names — only the `data` object changes.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/addresses
git commit -m "Persist geocoding fields on addresses"
```

---

### Task 6: Web geocode client and empty-state logic

**Files:**
- Create: `apps/web/app/lib/api.ts`
- Create: `apps/web/app/lib/geocode.ts`
- Create: `apps/web/app/lib/geocode.test.ts`
- Create: `apps/web/app/lib/use-debounced-value.ts`
- Modify: `apps/web/app/lib/events.ts`

**Interfaces:**
- Consumes: `GET /api/geocode` (Task 4).
- Produces: `geocodeApi.search(q)`, `geocodeKeys.search(q)`, `emptyStateMessage(state)`, `MIN_QUERY_LENGTH`, `AddressSelection`, `useDebouncedValue(value, delay)`, and the re-exported `ApiError`/`request` from `./api`.

`ApiError` and `request` move into `lib/api.ts` so the geocode client can share them rather than duplicating the fetch/error handling. `events.ts` re-exports `ApiError`, so every existing import of it keeps working untouched.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/lib/geocode.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyStateMessage, geocodeApi, geocodeKeys, MIN_QUERY_LENGTH } from "./geocode";

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("geocodeApi.search", () => {
    it("requests the geocode endpoint with an encoded query", async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ suggestions: [], filtered: 0 }), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );

        await geocodeApi.search("Nieuwmarkt 4, Amsterdam");

        const [url] = fetchMock.mock.calls[0] as [string];

        expect(url).toBe("http://api.test/api/geocode?q=Nieuwmarkt%204%2C%20Amsterdam");
    });
});

describe("geocodeKeys", () => {
    it("keys by the query so distinct searches are cached separately", () => {
        expect(geocodeKeys.search("dam")).not.toEqual(geocodeKeys.search("damrak"));
    });
});

// These three states look identical to a user if they share one message, and
// they call for different reactions: retype, rephrase, or try again later.
describe("emptyStateMessage", () => {
    it("says nothing while the query is too short", () => {
        expect(emptyStateMessage({ status: "idle" })).toBeNull();
    });

    it("says nothing while loading", () => {
        expect(emptyStateMessage({ status: "loading" })).toBeNull();
    });

    it("says nothing when there are suggestions", () => {
        expect(
            emptyStateMessage({ status: "ready", suggestionCount: 3, filtered: 0 }),
        ).toBeNull();
    });

    it("reports a plain miss when upstream matched nothing", () => {
        const message = emptyStateMessage({ status: "ready", suggestionCount: 0, filtered: 0 });

        expect(message).toBe("Address not found. Try a different address.");
    });

    it("explains the filter when matches existed but none were usable", () => {
        const message = emptyStateMessage({ status: "ready", suggestionCount: 0, filtered: 4 });

        // A user who searched for a park or a venue by name needs to know why
        // a place they know exists isn't listed — otherwise it reads as a typo.
        expect(message).toMatch(/only street addresses/i);
    });

    it("blames the service, not the address, on failure", () => {
        const message = emptyStateMessage({ status: "error" });

        expect(message).toMatch(/unavailable/i);
        expect(message).not.toMatch(/not found/i);
    });
});

describe("MIN_QUERY_LENGTH", () => {
    it("matches the contract's floor", () => {
        expect(MIN_QUERY_LENGTH).toBe(3);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web exec vitest run geocode`
Expected: FAIL — cannot find module `./geocode`.

- [ ] **Step 3: Extend the `Address` type with the stored geocoding fields**

`apps/web/app/lib/events.ts` describes what the API returns. It has no knowledge
of the new columns yet, so Task 8's `toFormValues` would not compile. Add the
four fields to the existing `Address` type:

```ts
export type Address = {
    id: string;
    label: string | null;
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
    // Null for addresses created before geocoding existed.
    lat: number | null;
    lon: number | null;
    osmId: string | null;
    raw: unknown;
    createdAt: string;
    updatedAt: string;
};
```

Leave `EventRecord` and everything else in the file alone.

- [ ] **Step 4: Extract the shared fetch client**

Create `apps/web/app/lib/api.ts` by moving `ApiError` and `request` out of `apps/web/app/lib/events.ts` verbatim, plus the `API_URL` constant:

```ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Carries the server's status and Zod issues so the form can map them onto
 *  fields instead of showing one generic banner. */
export class ApiError extends Error {
    readonly status: number;
    readonly issues?: Array<{ path: PropertyKey[]; message: string }>;

    constructor(
        message: string,
        status: number,
        issues?: Array<{ path: PropertyKey[]; message: string }>,
    ) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.issues = issues;
    }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

        throw new ApiError(
            body?.message ?? `Request failed with status ${response.status}`,
            response.status,
            body?.issues,
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}
```

**Copy the real current bodies of `ApiError` and `request` out of `events.ts`** rather than trusting the snippet above — that file has been through several fixes and the details matter. The snippet shows the expected shape, not a licence to rewrite it.

In `apps/web/app/lib/events.ts`, delete those two declarations and the `API_URL` constant, then add at the top:

```ts
import { API_URL, request } from "./api";

export { ApiError } from "./api";
```

Everything else in `events.ts` stays exactly as it is, including `imageUrl`'s use of `API_URL`.

- [ ] **Step 5: Write the debounce hook**

`apps/web/app/lib/use-debounced-value.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Delays a fast-changing value. Used to keep a keystroke from becoming an
 * upstream geocoder call — Photon throttles extensive use.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);

        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
```

- [ ] **Step 6: Write the geocode client**

`apps/web/app/lib/geocode.ts`:

```ts
import type { GeocodeResponse, GeocodeSuggestion } from "@repo/contracts";

import { request } from "./api";

export type { GeocodeSuggestion };

/**
 * What the form holds: a fresh Photon pick, or an address saved before
 * geocoding existed, which has no coordinates and no OSM id.
 *
 * These stay nullable rather than defaulting to 0. `lat: 0, lon: 0` is Null
 * Island off the coast of Africa, and on edit it would be written back over a
 * perfectly good row — a fabricated coordinate is worse than an absent one.
 */
export type AddressSelection = Omit<GeocodeSuggestion, "lat" | "lon" | "osmId"> & {
    lat: number | null;
    lon: number | null;
    osmId: string | null;
};

/** Mirrors the contract's `q.min(3)`. Shorter queries are never sent. */
export const MIN_QUERY_LENGTH = 3;

export const geocodeKeys = {
    search: (q: string) => ["geocode", q] as const,
};

export const geocodeApi = {
    search: (q: string) =>
        request<GeocodeResponse>(`/api/geocode?q=${encodeURIComponent(q)}`),
};

export type GeocodeState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; suggestionCount: number; filtered: number };

/**
 * The message shown when the list has nothing to offer, or null when the list
 * should speak for itself.
 *
 * There is no manual entry, so this message is the user's entire recourse. The
 * two empty outcomes must read differently: "nothing matched" invites a retype,
 * while "matches existed but all were filtered out" has to explain the filter,
 * otherwise searching a venue by name — the most common way to get here — is
 * indistinguishable from a typo.
 */
export const emptyStateMessage = (state: GeocodeState): string | null => {
    if (state.status === "error") {
        return "Address lookup is unavailable right now. You can still save the event without a venue.";
    }

    if (state.status !== "ready" || state.suggestionCount > 0) {
        return null;
    }

    return state.filtered > 0
        ? "Only street addresses can be selected. Try searching with a street name and number."
        : "Address not found. Try a different address.";
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter web exec vitest run`
Expected: PASS — the geocode tests plus every pre-existing web test, which must not regress.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/lib
git commit -m "Add the geocode client and empty-state messages"
```

---

### Task 7: The AddressSearch component

**Files:**
- Create: `apps/web/app/components/address-search.tsx`

**Interfaces:**
- Consumes: `geocodeApi`, `geocodeKeys`, `emptyStateMessage`, `MIN_QUERY_LENGTH`, `GeocodeSuggestion` (Task 6); `useDebouncedValue` (Task 6).
- Produces: `<AddressSearch id value onChange />` where `value: AddressSelection | null` and `onChange: (value: GeocodeSuggestion | null) => void`. It accepts a legacy address (no coordinates) as its current value, but every new selection it emits is a full `GeocodeSuggestion`.

Base UI 1.8 ships an `Autocomplete` primitive, which handles the ARIA roles, keyboard navigation and focus management. Build on it rather than hand-rolling a listbox.

**Two API details that will cost you an hour if you miss them:**

1. `Autocomplete.Root` filters items client-side by default. Our filtering happens server-side, so pass `filter={null}` to switch the built-in filtering off — otherwise Base UI will filter the already-filtered results again against the raw input string and hide valid suggestions.
2. `Autocomplete.Empty` "renders its children only when the list is empty" and its own root element **must stay mounted** for screen readers to announce changes. Never conditionally render `<Autocomplete.Empty>` itself — conditionally render what is *inside* it.

- [ ] **Step 1: Confirm the primitive's exports before writing against them**

```bash
cat node_modules/.pnpm/@base-ui+react@1.8.0_@types+react@19.2.18_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/autocomplete/index.parts.d.ts
```

Expected: `Root`, `Input`, `List`, `Item`, `Empty`, `Status`, `Portal`, `Positioner`, `Popup`, `Clear`, `Value`, `Trigger`, `Icon`, `Collection`, `Group`. If a part named below is absent, adapt the markup and say so in your report — the component's own `id`/`value`/`onChange` contract does not change.

Import style matches the vendored components: `import { Autocomplete } from "@base-ui/react/autocomplete";`

- [ ] **Step 2: Write the component**

`apps/web/app/components/address-search.tsx`:

```tsx
"use client";

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";

import {
    emptyStateMessage,
    geocodeApi,
    geocodeKeys,
    MIN_QUERY_LENGTH,
    type AddressSelection,
    type GeocodeState,
    type GeocodeSuggestion,
} from "@/lib/geocode";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { colors, radius, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    inputRow: { position: "relative", display: "flex", alignItems: "center" },
    clear: {
        position: "absolute",
        insetInlineEnd: "0.5rem",
        display: "flex",
        alignItems: "center",
        borderStyle: "none",
        backgroundColor: "transparent",
        color: colors.mutedForeground,
        cursor: "pointer",
    },
    input: {
        width: "100%",
        borderRadius: radius.md,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: colors.border,
        backgroundColor: colors.background,
        color: colors.foreground,
        paddingInline: "0.75rem",
        paddingBlock: "0.5rem",
    },
    popup: {
        borderRadius: radius.md,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: colors.border,
        backgroundColor: colors.background,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12)",
        paddingBlock: "0.25rem",
        maxHeight: "18rem",
        overflowY: "auto",
        width: "var(--anchor-width)",
    },
    item: {
        cursor: "default",
        paddingInline: "0.75rem",
        paddingBlock: "0.5rem",
        backgroundColor: { default: "transparent", ":hover": colors.muted },
    },
    message: {
        color: colors.mutedForeground,
        paddingInline: "0.75rem",
        paddingBlock: "0.5rem",
    },
});

export type AddressSearchProps = {
    id: string;
    value: AddressSelection | null;
    onChange: (value: GeocodeSuggestion | null) => void;
};

export function AddressSearch({ id, value, onChange }: AddressSearchProps) {
    const [query, setQuery] = useState(value?.display ?? "");
    const debounced = useDebouncedValue(query.trim(), 300);

    const enabled = debounced.length >= MIN_QUERY_LENGTH;

    const { data, isFetching, isError } = useQuery({
        queryKey: geocodeKeys.search(debounced),
        queryFn: () => geocodeApi.search(debounced),
        enabled,
        // Addresses do not move; refetching on focus would only spend upstream
        // calls Photon asks us to be sparing with.
        staleTime: 60 * 60 * 1000,
        retry: false,
    });

    const state: GeocodeState = !enabled
        ? { status: "idle" }
        : isError
          ? { status: "error" }
          : isFetching && !data
            ? { status: "loading" }
            : data
              ? { status: "ready", suggestionCount: data.suggestions.length, filtered: data.filtered }
              : { status: "loading" };

    const message = emptyStateMessage(state);
    const items = data?.suggestions ?? [];

    return (
        <Autocomplete.Root
            items={items}
            // Filtering happens server-side; the built-in filter would hide
            // valid results by re-filtering them against the raw input.
            filter={null}
            value={query}
            onValueChange={(next: string) => {
                setQuery(next);

                // Editing the text abandons the previous selection: what is in
                // the box must always be what would be saved.
                if (value && next !== value.display) {
                    onChange(null);
                }
            }}
            onItemHighlighted={() => undefined}>
            <div {...stylex.props(styles.inputRow)}>
                <Autocomplete.Input
                    id={id}
                    placeholder="Search for an address"
                    {...stylex.props(styles.input)}
                />

                {/* The spec requires a selection be clearable without deleting
                    the text by hand. Rendered only when there is something to
                    clear, so it never reads as a disabled control. */}
                {(value || query !== "") && (
                    <Autocomplete.Clear
                        aria-label="Clear address"
                        onClick={() => {
                            onChange(null);
                            setQuery("");
                        }}
                        {...stylex.props(styles.clear)}>
                        <XIcon size={16} />
                    </Autocomplete.Clear>
                )}
            </div>

            <Autocomplete.Portal>
                <Autocomplete.Positioner sideOffset={4}>
                    <Autocomplete.Popup {...stylex.props(styles.popup, typography.sm)}>
                        <Autocomplete.List>
                            {(item: GeocodeSuggestion) => (
                                <Autocomplete.Item
                                    key={item.osmId}
                                    value={item}
                                    onClick={() => {
                                        onChange(item);
                                        setQuery(item.display);
                                    }}
                                    {...stylex.props(styles.item)}>
                                    {item.display}
                                </Autocomplete.Item>
                            )}
                        </Autocomplete.List>

                        {/* Must stay mounted: Base UI announces changes through
                            this element, so only its children are conditional. */}
                        <Autocomplete.Empty {...stylex.props(styles.message)}>
                            {message}
                        </Autocomplete.Empty>
                    </Autocomplete.Popup>
                </Autocomplete.Positioner>
            </Autocomplete.Portal>
        </Autocomplete.Root>
    );
}
```

If `Autocomplete.Item`'s selection callback is named differently in 1.8 (check `item/AutocompleteItem.d.ts`), wire the selection through whatever it does provide — the requirement is that clicking or pressing Enter on an item calls `onChange(item)` and puts `item.display` in the input.

- [ ] **Step 3: Verify it compiles and lints**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec biome lint .`
Expected: PASS, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/address-search.tsx
git commit -m "Add the address search combobox"
```

---

### Task 8: Replace the venue fields in the event form

**Files:**
- Modify: `apps/web/app/lib/event-form.ts`
- Modify: `apps/web/app/lib/event-form.test.ts`
- Modify: `apps/web/app/components/event-form.tsx`

**Interfaces:**
- Consumes: `AddressSearch` (Task 7); `GeocodeSuggestion` (Task 6); `createAddressInput` with geocoding fields (Task 1).
- Produces: `EventFormValues.address: AddressSelection | null` replacing `EventFormValues.venue`; `toAddressInput(selection)`; `resolveAddressId` unchanged in signature.

`VenueValues`, `venueIsEmpty` and the all-or-nothing venue rule all disappear: with a single selected suggestion there is no partial venue to guard against.

- [ ] **Step 1: Update the helper tests**

In `apps/web/app/lib/event-form.test.ts`:

1. Delete the whole `venueIsEmpty` describe block, and every test asserting the "Street, city and country are required when a venue is given." message.
2. Replace any `venue: { ... }` literal in a form-values fixture with `address: SUGGESTION` or `address: null`, adding this fixture near the top of the file:

```ts
const SUGGESTION = {
    osmId: "W123456",
    display: "Nieuwmarkt 4, Amsterdam, Netherlands",
    line1: "Nieuwmarkt 4",
    city: "Amsterdam",
    region: "North Holland",
    postalCode: "1012 CR",
    country: "Netherlands",
    lat: 52.3723,
    lon: 4.9002,
    raw: { type: "Feature" },
};
```

3. Add these tests:

```ts
describe("toAddressInput", () => {
    it("carries the geocoding fields onto the address payload", () => {
        const input = toAddressInput(SUGGESTION);

        expect(input).toEqual({
            label: null,
            line1: "Nieuwmarkt 4",
            line2: null,
            city: "Amsterdam",
            region: "North Holland",
            postalCode: "1012 CR",
            country: "Netherlands",
            lat: 52.3723,
            lon: 4.9002,
            osmId: "W123456",
            raw: { type: "Feature" },
        });
    });
});

describe("resolveAddressId with a selected address", () => {
    it("returns null when no address is selected", async () => {
        const api = { create: vi.fn(), update: vi.fn() };

        await expect(
            resolveAddressId({ ...emptyFormValues(), address: null }, null, api),
        ).resolves.toBeNull();
        expect(api.create).not.toHaveBeenCalled();
    });

    it("creates an address from the selection", async () => {
        const api = { create: vi.fn().mockResolvedValue({ id: "a1" }), update: vi.fn() };

        await expect(
            resolveAddressId({ ...emptyFormValues(), address: SUGGESTION }, null, api),
        ).resolves.toBe("a1");
        expect(api.create).toHaveBeenCalledWith(toAddressInput(SUGGESTION));
    });

    it("updates the existing address in place", async () => {
        const api = { create: vi.fn(), update: vi.fn().mockResolvedValue({ id: "a1" }) };

        await expect(
            resolveAddressId({ ...emptyFormValues(), address: SUGGESTION }, "a1", api),
        ).resolves.toBe("a1");
        expect(api.update).toHaveBeenCalledWith("a1", toAddressInput(SUGGESTION));
        expect(api.create).not.toHaveBeenCalled();
    });
});

describe("toFormValues", () => {
    it("rebuilds a selection from a stored address so the edit form shows it", () => {
        const values = toFormValues({
            id: "e1",
            name: "Retro",
            description: null,
            addressId: "a1",
            imageKey: null,
            startsAt: null,
            endsAt: null,
            createdAt: "",
            updatedAt: "",
            address: {
                id: "a1",
                label: null,
                line1: "Nieuwmarkt 4",
                line2: null,
                city: "Amsterdam",
                region: "North Holland",
                postalCode: "1012 CR",
                country: "Netherlands",
                lat: 52.3723,
                lon: 4.9002,
                osmId: "W123456",
                raw: { type: "Feature" },
                createdAt: "",
                updatedAt: "",
            },
        } as never);

        expect(values.address?.display).toBe("Nieuwmarkt 4, Amsterdam, Netherlands");
        expect(values.address?.osmId).toBe("W123456");
    });

    // A legacy address predates geocoding and has no coordinates. Defaulting
    // them to 0 would put it at Null Island, and saving the event without
    // touching the venue would write that over a perfectly good row.
    it("keeps a pre-geocoding address's missing coordinates missing", () => {
        const values = toFormValues({
            id: "e1",
            name: "Retro",
            description: null,
            addressId: "a1",
            imageKey: null,
            startsAt: null,
            endsAt: null,
            createdAt: "",
            updatedAt: "",
            address: {
                id: "a1",
                label: null,
                line1: "1 Civic Square",
                line2: null,
                city: "Amsterdam",
                region: null,
                postalCode: null,
                country: "NL",
                lat: null,
                lon: null,
                osmId: null,
                raw: null,
                createdAt: "",
                updatedAt: "",
            },
        } as never);

        expect(values.address?.lat).toBeNull();
        expect(values.address?.lon).toBeNull();
        expect(toAddressInput(values.address!).lat).toBeNull();
    });

    it("leaves the address null for an event without one", () => {
        const values = toFormValues({
            id: "e1",
            name: "Retro",
            description: null,
            addressId: null,
            imageKey: null,
            startsAt: null,
            endsAt: null,
            createdAt: "",
            updatedAt: "",
            address: null,
        } as never);

        expect(values.address).toBeNull();
    });
});
```

Keep every existing `formLevelError` test for the `endsAt > startsAt` rule, including the one asserting the return is a plain `string` — that guard exists because an object stringifies to `"[object Object]"`, which has bitten this form before.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web exec vitest run event-form`
Expected: FAIL — `address` does not exist on `EventFormValues`.

- [ ] **Step 3: Rework the form helpers**

In `apps/web/app/lib/event-form.ts`:

Delete `VenueValues`, `emptyVenue` and `venueIsEmpty` entirely. Add the import:

```ts
import type { AddressSelection, GeocodeSuggestion } from "./geocode";
```

Change `EventFormValues`:

```ts
export type EventFormValues = {
    name: string;
    description: string;
    startsAt: Date | null;
    endsAt: Date | null;
    /** A geocoded selection, or an address saved before geocoding existed.
     *  Null when the event has no venue. There is no manual entry. */
    address: AddressSelection | null;
    imageFile: File | null;
    existingImageKey: string | null;
};
```

`emptyFormValues` sets `address: null` in place of `venue: emptyVenue()`.

`toFormValues` rebuilds a selection from the stored address, because the edit form has to show what is already saved:

```ts
    address: event.address
        ? {
              osmId: event.address.osmId,
              display: [event.address.line1, event.address.city, event.address.country].join(", "),
              line1: event.address.line1,
              city: event.address.city,
              region: event.address.region,
              postalCode: event.address.postalCode,
              country: event.address.country,
              // Deliberately not defaulted to 0: see AddressSelection. A
              // legacy address keeps its missing coordinates missing, so
              // saving an untouched venue cannot overwrite it with 0,0.
              lat: event.address.lat,
              lon: event.address.lon,
              raw: event.address.raw ?? null,
          }
        : null,
```

Replace `formLevelError` with the date rule alone — the venue rule has nothing left to guard:

```ts
/**
 * Form-level (cross-field) validation, run from `EventForm`'s `onSubmit`
 * validator. Pulled out here so it's covered by a plain unit test rather than
 * only exercised through the rendered form.
 *
 * Returns a plain string, not `{ form: "..." }`: the subscriber in
 * `event-form.tsx` renders the value directly, and an object stringifies to
 * "[object Object]".
 */
export const formLevelError = (
    value: Pick<EventFormValues, "startsAt" | "endsAt">,
): string | undefined => {
    // Client-side mirror of the server's `endsAt > startsAt` rule (UX only —
    // the server remains authoritative). Catching it here avoids uploading an
    // image / creating an address for a submission the server would reject
    // anyway.
    if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
        return "Ends must be after starts.";
    }

    return undefined;
};
```

Replace `toAddressInput`:

```ts
export const toAddressInput = (suggestion: AddressSelection): CreateAddressInput => ({
    // Street-address results carry no name, and the venue-name input is gone.
    label: null,
    line1: suggestion.line1,
    line2: null,
    city: suggestion.city,
    region: suggestion.region,
    postalCode: suggestion.postalCode,
    country: suggestion.country,
    lat: suggestion.lat,
    lon: suggestion.lon,
    osmId: suggestion.osmId,
    raw: suggestion.raw,
});
```

In `resolveAddressId`, swap the guard and the payload, keeping the try/catch and the issue-path prefixing exactly as they are:

```ts
    if (!values.address) {
        return null;
    }

    const input = toAddressInput(values.address);
```

The prefix stays `"address"`-shaped: change `["venue", ...issue.path]` to `["address", ...issue.path]`, and update that function's doc comment to say the form now renders a single `address` field.

- [ ] **Step 4: Rework the form component**

In `apps/web/app/components/event-form.tsx`:

1. Delete the `VENUE_FIELDS` array (the seven `["venue.label", "Venue name"]` entries) and the entire `<div {...stylex.props(styles.section)}>` venue block that maps over it.
2. In `INLINE_FIELDS`, replace every `venue.*` entry with the single entry `"address"`.
3. Add the import `import { AddressSearch } from "@/components/address-search";`.
4. Insert the new field where the venue section used to be:

```tsx
            <form.Field name="address">
                {(field) => (
                    <div {...stylex.props(styles.field)}>
                        <Label htmlFor="address">Venue</Label>
                        <AddressSearch
                            id="address"
                            value={field.state.value}
                            onChange={(value) => field.handleChange(value)}
                        />
                        <p {...stylex.props(styles.hint, typography.sm)}>
                            Optional. Search for a street address.
                        </p>
                        {fieldErrors.address && (
                            <p {...stylex.props(styles.error, typography.sm)}>
                                {fieldErrors.address}
                            </p>
                        )}
                    </div>
                )}
            </form.Field>
```

5. If `styles.section`, `styles.sectionTitle` or `styles.hint` become unreferenced after the deletion, remove those keys too — Biome does not flag unused keys inside `stylex.create`, so this is a manual check. Confirm with `grep -n "styles.section\|styles.sectionTitle\|styles.hint" apps/web/app/components/event-form.tsx`.
6. Leave the `name` field's `onMount`/`isTouched` arrangement untouched: it is what keeps Create disabled on an empty form, and an e2e test asserts it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web exec vitest run && pnpm --filter web exec tsc --noEmit && pnpm --filter web exec biome lint .`
Expected: PASS, zero lint warnings.

- [ ] **Step 6: Verify by hand**

With `pnpm dev` and `docker compose up -d` running, open `http://localhost:3000/events/new` and check all four behaviours:

1. Type `Nieuwmarkt` — suggestions appear; pick one; the input shows the full address.
2. Type `zzzzzzzzzz` — "Address not found. Try a different address."
3. Type `Vondelpark` — the message about only street addresses being selectable (Photon returns the park, the filter drops it).
4. Submit with a selection and confirm what was stored:

```bash
docker compose exec -T postgres psql -U postgres -d eventapp \
  -c 'SELECT line1, city, country, lat, lon, "osmId", raw IS NOT NULL AS has_raw FROM "Address" ORDER BY "createdAt" DESC LIMIT 1;'
```

Expected: the picked address with coordinates, an `osmId`, and `has_raw` true.

**Delete the event and address you created**, then confirm the counts are back to where they started — the dev database is shared and this repo has leaked rows into it before.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app
git commit -m "Replace the venue fields with address search"
```

---

### Task 9: End-to-end coverage and documentation

**Files:**
- Modify: `apps/e2e/tests/events.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/testing-conventions.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing downstream.

- [ ] **Step 1: Stub the geocode endpoint**

The suite must not call Photon: it is a free service that asks callers to be sparing, and a test depending on live OSM data is a test that fails for reasons unrelated to this codebase. Intercept our own endpoint instead.

Add near the top of `apps/e2e/tests/events.spec.ts`:

```ts
const SUGGESTION = {
    osmId: "W123456",
    display: "Nieuwmarkt 4, Amsterdam, Netherlands",
    line1: "Nieuwmarkt 4",
    city: "Amsterdam",
    region: "North Holland",
    postalCode: "1012 CR",
    country: "Netherlands",
    lat: 52.3723,
    lon: 4.9002,
    raw: { type: "Feature", properties: { osm_id: 123456 } },
};

/**
 * Serves the address search from a fixture. Photon is a free third-party
 * service; pointing the suite at it would make these tests fail on someone
 * else's outage and spend somebody else's quota.
 */
const stubGeocode = async (
    page: Page,
    body: { suggestions: unknown[]; filtered: number } = { suggestions: [SUGGESTION], filtered: 0 },
) => {
    await page.route("**/api/geocode**", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
        }),
    );
};
```

Add `Page` to the `@playwright/test` import.

- [ ] **Step 2: Drive the combobox in the lifecycle test**

In the `creates an event with every field…` test, call `await stubGeocode(page);` immediately after `await page.goto("/")`, then replace these three lines:

```ts
    await page.getByLabel("Street", { exact: true }).fill("1 Civic Square");
    await page.getByLabel("City").fill("Amsterdam");
    await page.getByLabel("Country").fill("NL");
```

with:

```ts
    await page.getByLabel("Venue").fill("Nieuwmarkt");
    await page.getByRole("option", { name: SUGGESTION.display }).click();
    await expect(page.getByLabel("Venue")).toHaveValue(SUGGESTION.display);
```

In the same test, any later assertion that the venue survived an edit should assert on `SUGGESTION.city` rather than `"Amsterdam"` typed by hand — read the surrounding code and keep its intent.

- [ ] **Step 3: Replace the all-or-nothing test with the not-found states**

Delete the whole `requires street, city and country together` test: it asserts a rule this work removes, so leaving it would fail and rewriting it to pass would assert nothing.

Add in its place:

```ts
test("tells the user when no address matched", async ({ page }) => {
    await stubGeocode(page, { suggestions: [], filtered: 0 });
    await page.goto("/events/new");

    await page.getByLabel("Venue").fill("zzzzzzzzzz");

    await expect(page.getByText("Address not found. Try a different address.")).toBeVisible();
});

test("explains the filter when matches existed but none were usable", async ({ page }) => {
    // What a user sees after searching a park or a venue by name: Photon
    // returned results, but none carried the street/city/country the database
    // requires. Saying only "not found" here would read as a typo.
    await stubGeocode(page, { suggestions: [], filtered: 5 });
    await page.goto("/events/new");

    await page.getByLabel("Venue").fill("Vondelpark");

    await expect(page.getByText(/only street addresses/i)).toBeVisible();
});

test("keeps the event saveable when address lookup is down", async ({ page }) => {
    await page.route("**/api/geocode**", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Address lookup is unavailable right now."}' }),
    );
    await page.goto("/events/new");

    const name = uniqueName("E2E event");

    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Venue").fill("Nieuwmarkt");

    await expect(page.getByText(/unavailable/i)).toBeVisible();
    // The venue is optional: a geocoder outage must never block saving.
    await expect(page.getByRole("button", { name: "Create" })).toBeEnabled();
});
```

The third test creates an event, so it must clean up. Follow whatever the existing `beforeAll` sweep and end-of-test cleanup do — read them first; they delete both the Event and its Address by id, and a new leak here would undo a fix this repo already paid for.

- [ ] **Step 4: Run the suite**

Run: `pnpm --filter e2e test:e2e`
Expected: PASS — 5 tests.

- [ ] **Step 5: Document the geocoding module**

In `docs/architecture.md`, add `geocoding/` to the API module list, and add this section after "Shared contracts":

```markdown
## Geocoding

Address search proxies Photon through `GET /api/geocode`; the browser never
calls the geocoder directly. The proxy is the only place that knows the upstream
URL, and it is what sets a `User-Agent` identifying this application — a header
browsers cannot set — caches responses, collapses concurrent identical queries
and filters out results that cannot fill `line1`, `city` and `country`.

Nominatim was the original choice and is not usable here: its policy forbids
client-side autocomplete outright and caps the public instance at one request
per second. Photon is built for type-ahead over the same OpenStreetMap data.

Because filtering happens server-side, the response carries a `filtered` count
alongside `suggestions` so the form can tell "nothing matched" apart from
"matches existed but none were usable" — two different messages to the user.

Addresses store the full Photon feature in `Address.raw` alongside the derived
columns and `lat`/`lon`/`osmId`. All of those are nullable: addresses created
before geocoding existed have none of them.
```

In `docs/testing-conventions.md`, add:

```markdown
- Never let a test call a third-party service. The address-search specs stub
  `**/api/geocode**`; pointing them at Photon would make them fail on someone
  else's outage and spend someone else's quota.
```

- [ ] **Step 6: Verify the whole repo**

```bash
pnpm check-types && pnpm lint && pnpm test && pnpm --filter e2e test:e2e
```

Expected: all pass, zero lint warnings. Postgres must be up.

- [ ] **Step 7: Commit**

```bash
git add apps/e2e docs
git commit -m "Cover address search end to end and document the geocoding module"
```

---

## Done when

- `/events/new` and `/events/[id]/edit` search addresses through one input and store the picked result with coordinates and the raw Photon feature
- A search with no matches, a search whose matches were all filtered out, and a geocoder outage each show a different message
- A geocoder outage never blocks saving an event
- No test calls Photon
- `pnpm check-types`, `pnpm lint` (zero warnings), `pnpm test` and `pnpm --filter e2e test:e2e` all pass
- The seven venue inputs, `VenueValues`, `venueIsEmpty` and the all-or-nothing venue rule are gone
