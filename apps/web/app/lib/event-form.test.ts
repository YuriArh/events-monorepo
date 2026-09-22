import { createEventInput } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import type { EventRecord } from "./events";
import { emptyFormValues, issuesByField, toEventInput, toFormValues, venueIsEmpty } from "./event-form";

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
