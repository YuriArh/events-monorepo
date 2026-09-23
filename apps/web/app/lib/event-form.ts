import type { CreateAddressInput, CreateEventInput } from "@repo/contracts";

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
    imageFile: File | null;
    existingImageKey: string | null;
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
    imageFile: null,
    existingImageKey: event.imageKey,
});

export const venueIsEmpty = (venue: VenueValues) =>
    Object.values(venue).every((value) => value.trim() === "");

/**
 * Form-level (cross-field) validation, run from `EventForm`'s `onSubmit`
 * validator. Pulled out here so it's covered by a plain unit test rather than
 * only exercised through the rendered form.
 *
 * Returns a plain string, not `{ form: "..." }`: the subscriber in
 * `event-form.tsx` renders the value directly, and an object stringifies to
 * "[object Object]".
 */
export const formLevelError = (value: Pick<EventFormValues, "venue" | "startsAt" | "endsAt">): string | undefined => {
    if (!venueIsEmpty(value.venue)) {
        const missing = (["line1", "city", "country"] as const).filter(
            (key) => value.venue[key].trim() === "",
        );

        if (missing.length > 0) {
            return "Street, city and country are required when a venue is given.";
        }
    }

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

/** Shapes zod issues (from the client parse or a server 400) for field display. */
export const issuesByField = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
    const byField: Record<string, string> = {};

    for (const issue of issues) {
        const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
        byField[key] ??= issue.message;
    }

    return byField;
};
