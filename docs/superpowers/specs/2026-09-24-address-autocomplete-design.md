# Address autocomplete design

**Date:** 2026-09-24
**Status:** Approved, not yet planned

## Goal

Replace the event form's seven manual venue inputs with a single address search
box that suggests real addresses as the user types, and store the geocoder's
full response alongside the structured fields it yields.

## Why Photon, not Nominatim

The request was for Nominatim. Its usage policy forbids this use:

> **Auto-complete search** — This is not yet supported by Nominatim and you must
> not implement such a service on the client side using the API.

It also caps the public instance at an absolute maximum of one request per
second and requires a User-Agent identifying the application, which a browser
cannot set. Type-ahead would breach the policy and the rate ceiling.

Photon (`photon.komoot.io`) is built by Komoot specifically for type-ahead over
the same OpenStreetMap data, with no such prohibition. It is best-effort: the
operators state that extensive usage will be throttled and give no availability
guarantee. Section "Failure handling" takes that seriously.

If usage ever outgrows the public instance, Photon is open source and
self-hostable. The proxy in section "Architecture" is what keeps that a
one-module change.

## Architecture

A new `geocoding` module in the API — `geocode.routes.ts`, `geocode.service.ts`,
`geocode.schema.ts`, `geocode.types.ts`, matching the existing `events` and
`addresses` modules. No repository: this module owns no tables.

```
GET /api/geocode?q=<query>&limit=<n>
```

The web app never calls Photon directly. The proxy is the single place that:

- sets a descriptive `User-Agent` identifying this application, which a browser
  cannot do;
- caches upstream responses;
- throttles and bounds concurrent upstream calls;
- filters and normalises results, so the shape the browser sees is ours, not
  Photon's;
- isolates the provider. Swapping to a self-hosted Photon or another geocoder
  changes this module and nothing else.

This mirrors `imageUrl` in `apps/web/app/lib/events.ts` being the only thing
that knows how images are stored.

## Request and response contract

New schemas in `@repo/contracts`. The package stays a single module with no
relative imports — see `docs/architecture.md` for why.

```ts
geocodeQuery = { q: string (min 3, max 200), limit: number (1-10, default 8) }

geocodeSuggestion = {
  display: string,     // "Nieuwmarkt 4, Amsterdam, Netherlands"
  line1: string,       // "Nieuwmarkt 4" — street plus house number when present
  city: string,
  region: string | null,
  postalCode: string | null,
  country: string,
  lat: number,
  lon: number,
  osmId: string,      // `${osm_type}${osm_id}` — stable per place, used as the key
  raw: unknown,        // the complete Photon feature, passed through verbatim
}
```

`GET /api/geocode` returns:

```ts
{
  suggestions: geocodeSuggestion[],
  // How many upstream results were dropped by the filter below. Lets the form
  // tell "nothing matched" apart from "matches existed but none were usable",
  // which are different messages to the user. Without this the browser cannot
  // distinguish them, because filtering happens server-side.
  filtered: number,
}
```

A query shorter than 3 characters is a 400. An upstream failure or timeout is a
503 with a message the form can display.

## Filtering

Photon returns a GeoJSON `FeatureCollection`. Properties vary widely by place
type: a street address carries `street`, `housenumber`, `postcode`, `city`,
`state`, `country`, `countrycode`; a point of interest carries `name` and often
no street at all.

Because `line1`, `city` and `country` are `NOT NULL` and there is no manual
entry fallback, the service keeps only features that can populate all three:

- `properties.street` present (house number optional), and
- `properties.city` present, and
- `properties.country` present.

Everything else is dropped before the response leaves the API. Results are
deduplicated by `osm_type` + `osm_id`, preserving Photon's ordering.

`line1` is `street` plus `housenumber` when the house number exists, otherwise
`street` alone.

**Consequence, accepted deliberately:** parks, landmarks and venues searched by
name will return nothing, because they carry no street. So will any address
OpenStreetMap does not have. See "Not found" below — the user's only recourse is
to search again with a different address.

## Data model

Additive migration only. No column is dropped, no type changes, no nullability
is tightened, so it cannot fail against existing rows:

```prisma
model Address {
  // unchanged: id, label, line1, line2, city, region, postalCode, country,
  //            event, createdAt, updatedAt, @@index([city])

  lat   Float?
  lon   Float?
  osmId String?
  raw   Json?
}
```

`raw` is nullable because addresses created before this feature have no Photon
object. `lat`/`lon`/`osmId` are nullable for the same reason.

`label` keeps its column and is preserved on a save that doesn't touch the
venue (an edit carries a loaded address's `label`/`line2` through unchanged),
but no UI in this feature writes a new one or renders it — see "Venue name"
below. Dropping the column is a destructive migration for no benefit and is
deliberately not part of this work.

## Form

The seven venue inputs, the "Venue name" input and the all-or-nothing venue
validator are removed. One combobox replaces them:

- 300ms debounce; queries below 3 characters are never sent.
- TanStack Query keyed on the debounced term, so identical terms are served from
  cache and in-flight requests are cancelled on a new keystroke.
- Full keyboard support: up/down to move, Enter to select, Escape to dismiss.
  ARIA combobox roles, since this is not a native control.
- A selection renders as the chosen address with a control to clear it and
  search again.
- On the edit route the field starts populated with the event's current address.

Venue remains optional: an event can be created with no address at all.

### Not found

There is no manual entry. When a search returns nothing the field shows a
message saying the address was not found and inviting another search — it does
not offer a way to type an address in by hand, and it does not let the raw
search text be saved as an address. The only path forward is searching again
for an address that exists.

The message must distinguish the two reasons a search comes back empty, because
they call for different next steps from the user:

- **Nothing matched** — "Address not found. Try a different address."
- **Matches existed but none were usable** (results came back, but all lacked a
  street, city or country and were filtered out) — say that only street
  addresses can be selected, so a user who searched for a park or a venue by
  name understands why a place they know exists is missing, rather than
  concluding the search is broken.

This distinction is a requirement, not a nicety: without it the most common
failure — searching a venue by name — looks identical to a typo.

Both states are distinct from an upstream failure, which is covered under
"Failure handling" and must read as a problem with the service rather than a
verdict on the address.

### Venue name

Dropped. Street-address results from Photon rarely carry a `name`, so a venue
can no longer be called "De Waag" or "Main Conference Hall" — events display the
street address only. This is a deliberate loss of capability, chosen to keep the
form to a single input.

## Failure handling

The venue is optional, so **a geocoder failure must never block saving an
event**. If Photon is down, throttled or slow, the dropdown shows an error and
the rest of the form continues to work.

- Upstream timeout, bounded so a hanging Photon cannot hold a request open.
- In-memory cache keyed on the normalised query, roughly an hour TTL, bounded in
  size. Address data barely moves, and caching is the main thing keeping usage
  off the "extensive" threshold that Photon throttles.
- Concurrent upstream calls are bounded.
- Server rejections of the address must still reach the user. The existing
  mechanism prefixes address issue paths so they land on the field that renders
  them; with the seven venue inputs gone there is one address field, so the
  prefixing collapses to mapping any address issue onto it. The rule it
  protects is unchanged: no rejection may be silent or unattributed.

## Testing

- **Unit, API:** the pure parts — filtering, deduplication, `line1` assembly,
  `display` formatting. These carry the fiddly logic and are tested directly.
- **Integration, API:** route tests with the upstream stubbed. Cover a filtered
  result set, a cache hit not re-calling upstream, an upstream failure becoming
  503, and a too-short query becoming 400. No test calls the real Photon.
- **Unit, web:** debounce and selection-state logic, plus the three empty
  states, which are easy to conflate and are the feature's most-hit paths:
  nothing matched, everything filtered out (`filtered > 0` with no suggestions),
  and upstream failure. Each must produce a different message.
- **E2E:** the current spec fills Street, City and Country by hand and the test
  `requires street, city and country together` asserts a rule this design
  deletes. Both are rewritten to drive the combobox. The e2e run stubs our own
  `/api/geocode` through Playwright's request interception, keeping the suite
  deterministic and off a free public service.

## Known limitations

1. Only street-level addresses are selectable. Parks, landmarks and named venues
   return nothing.
2. No manual entry. An address missing from OpenStreetMap cannot be attached to
   an event at all.
3. No venue name.
4. The public Photon instance is best-effort, with no availability guarantee and
   throttling for heavy use.
5. Reverse geocoding and map display are out of scope. `lat`/`lon` are stored
   for later use, not read by this work.
6. Partial-failure handling is unchanged and still deferred: a failed event save
   can leave a created address behind, and on edit the address is written before
   the event.

## Out of scope

Map rendering, distance or radius search over the stored coordinates, reverse
geocoding, self-hosting Photon, and backfilling coordinates onto the existing
address rows.
