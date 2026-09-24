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
