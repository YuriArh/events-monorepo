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
