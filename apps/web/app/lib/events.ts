const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Event = {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            // Only on requests that actually carry a body — sending it with an empty
            // body makes Fastify reject the request while trying to parse the JSON.
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
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
};

export const eventsApi = {
    list: () => request<Event[]>("/api/events"),
    create: (data: { name: string }) =>
        request<Event>("/api/events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name: string }) =>
        request<Event>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/api/events/${id}`, { method: "DELETE" }),
};
