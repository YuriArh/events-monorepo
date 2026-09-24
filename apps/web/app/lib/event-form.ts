import type { CreateAddressInput, CreateEventInput } from "@repo/contracts";

import { ApiError, type EventRecord } from "./events";
import type { AddressSelection } from "./geocode";

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

export const emptyFormValues = (): EventFormValues => ({
    name: "",
    description: "",
    startsAt: null,
    endsAt: null,
    address: null,
    imageFile: null,
    existingImageKey: null,
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
    imageFile: null,
    existingImageKey: event.imageKey,
});

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

type AddressCalls = {
    create: (input: CreateAddressInput) => Promise<{ id: string }>;
    update: (id: string, input: CreateAddressInput) => Promise<{ id: string }>;
};

/**
 * Step 2 of the submit sequence. Updating in place is safe because Event.addressId
 * is unique — an address belongs to exactly one event.
 *
 * The form renders a single `address` field. A server rejection of the
 * address call is re-thrown with its issue paths prefixed with "address" so
 * `issuesByField` (called by the form on the caught `ApiError`) produces keys
 * the form actually renders inline, instead of writing to dead state nothing
 * reads.
 */
export const resolveAddressId = async (
    values: EventFormValues,
    existingAddressId: string | null,
    api: AddressCalls,
): Promise<string | null> => {
    if (!values.address) {
        return null;
    }

    const input = toAddressInput(values.address);

    try {
        if (existingAddressId) {
            await api.update(existingAddressId, input);
            return existingAddressId;
        }

        const created = await api.create(input);
        return created.id;
    } catch (error) {
        if (error instanceof ApiError && error.issues) {
            throw new ApiError(
                error.message,
                error.status,
                error.issues.map((issue) => ({ ...issue, path: ["address", ...issue.path] })),
            );
        }

        throw error;
    }
};

/** Shapes zod issues (from the client parse or a server 400) for field display. */
export const issuesByField = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
    const byField: Record<string, string> = {};

    for (const issue of issues) {
        const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
        byField[key] ??= issue.message;
    }

    return byField;
};
