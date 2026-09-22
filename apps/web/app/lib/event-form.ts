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

/** Shapes zod issues (from the client parse or a server 400) for field display. */
export const issuesByField = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
    const byField: Record<string, string> = {};

    for (const issue of issues) {
        const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
        byField[key] ??= issue.message;
    }

    return byField;
};
