import type { CreateEventInput, UpdateEventInput } from "@repo/contracts";

import { request } from "./api";

export { ApiError } from "./api";

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

/** Dates arrive as ISO strings because this is JSON, not the Prisma model. */
export type EventRecord = {
    id: string;
    name: string;
    description: string | null;
    addressId: string | null;
    /** Null for events created before accounts existed — admin-only to change. */
    organizerId: string | null;
    /** Public fields only; null for events created before accounts existed. */
    organizer: { id: string; name: string | null } | null;
    imageKey: string | null;
    startsAt: string | null;
    endsAt: string | null;
    createdAt: string;
    updatedAt: string;
    address: Address | null;
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

/**
 * The single place that knows how images are stored. Swapping local disk for S3
 * should change this function and nothing else.
 */
export const uploadImage = async (file: File) => {
    const body = new FormData();
    body.append("file", file);

    return request<{ imageKey: string }>("/api/events/upload", { method: "POST", body });
};

/** Same-origin URL for a stored image key (served through the proxy), for use in <img src>. */
export const imageUrl = (key: string) => `/uploads/${key}`;
