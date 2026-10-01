import { createEventInput } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EventRecord } from "./events";
import {
    emptyFormValues,
    formLevelError,
    issuesByField,
    resolveImageKey,
    toAddressInput,
    toEventInput,
    toFormValues,
} from "./event-form";

const SUGGESTION = {
    osmId: "W123456",
    display: "Nieuwmarkt 4, Amsterdam, Netherlands",
    label: null,
    line1: "Nieuwmarkt 4",
    line2: null,
    city: "Amsterdam",
    region: "North Holland",
    postalCode: "1012 CR",
    country: "Netherlands",
    lat: 52.3723,
    lon: 4.9002,
    raw: { type: "Feature" },
};

const record: EventRecord = {
    id: "e1",
    name: "Team offsite",
    description: "Two days",
    addressId: "a1",
    organizerId: "u1",
    organizer: null,
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
        lat: 52.3723,
        lon: 4.9002,
        osmId: "W123456",
        raw: { type: "Feature" },
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
        expect(values.address && toAddressInput(values.address).lat).toBeNull();
    });

    // Regression: a legacy address can carry a venue `label` and a `line2`
    // (e.g. "Riverside Studio" / "Unit 3"). `AddressSelection` used to have no
    // such keys at all, so `toFormValues` never read them off a loaded
    // `Address`, and `toAddressInput` hardcoded both to null on every write —
    // silently wiping them on the very next edit-save, even when the venue
    // field itself was never touched.
    it("preserves a loaded address's label and line2 through a save", () => {
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
                label: "Riverside Studio",
                line1: "42 Dock Road",
                line2: "Unit 3",
                city: "London",
                region: null,
                postalCode: null,
                country: "GB",
                lat: 51.5,
                lon: -0.1,
                osmId: "W1",
                raw: null,
                createdAt: "",
                updatedAt: "",
            },
        } as never);

        expect(values.address?.label).toBe("Riverside Studio");
        expect(values.address?.line2).toBe("Unit 3");

        const input = values.address && toAddressInput(values.address);
        expect(input?.label).toBe("Riverside Studio");
        expect(input?.line2).toBe("Unit 3");
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

describe("toEventInput", () => {
    it("serialises dates back to ISO with an offset", () => {
        const input = toEventInput(toFormValues(record), { imageKey: null });

        expect(input.startsAt).toBe("2026-10-01T18:00:00.000Z");
    });

    it("passes through the resolved image key", () => {
        const input = toEventInput(emptyFormValues(), { imageKey: "x.png" });

        expect(input).toMatchObject({ imageKey: "x.png" });
    });

    it("embeds the selected venue", () => {
        const input = toEventInput({ ...emptyFormValues(), address: SUGGESTION }, { imageKey: null });

        expect(input.address).toEqual(toAddressInput(SUGGESTION));
    });

    // On an edit, null is what tells the API to delete the venue.
    it("sends null when no venue is selected", () => {
        const input = toEventInput(emptyFormValues(), { imageKey: null });

        expect(input.address).toBeNull();
    });

    it("sends empty text as null rather than an empty string", () => {
        const input = toEventInput({ ...emptyFormValues(), name: "Only a name" }, { imageKey: null });

        expect(input.description).toBeNull();
    });

    it("produces a payload the contract accepts", () => {
        const input = toEventInput(
            { ...emptyFormValues(), name: "Valid", address: SUGGESTION },
            { imageKey: null },
        );

        expect(createEventInput.safeParse(input).success).toBe(true);
    });
});

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

describe("resolveImageKey", () => {
    it("keeps the existing key when no new file was chosen", async () => {
        const upload = vi.fn();
        const values = { ...emptyFormValues(), existingImageKey: "old.png", imageFile: null };

        await expect(resolveImageKey(values, upload)).resolves.toBe("old.png");
        expect(upload).not.toHaveBeenCalled();
    });

    it("uploads and returns the new key when a file was chosen", async () => {
        const upload = vi.fn().mockResolvedValue({ imageKey: "new.png" });
        const file = new File(["x"], "photo.png", { type: "image/png" });
        const values = { ...emptyFormValues(), existingImageKey: "old.png", imageFile: file };

        await expect(resolveImageKey(values, upload)).resolves.toBe("new.png");
        expect(upload).toHaveBeenCalledWith(file);
    });
});

describe("formLevelError", () => {
    it("is undefined for an empty form with no dates", () => {
        expect(formLevelError(emptyFormValues())).toBeUndefined();
    });

    it("is undefined when startsAt is before endsAt", () => {
        const values = {
            ...emptyFormValues(),
            startsAt: new Date("2026-10-01T18:00:00.000Z"),
            endsAt: new Date("2026-10-01T21:00:00.000Z"),
        };

        expect(formLevelError(values)).toBeUndefined();
    });

    it("rejects endsAt equal to startsAt", () => {
        const same = new Date("2026-10-01T18:00:00.000Z");
        const values = { ...emptyFormValues(), startsAt: same, endsAt: same };

        expect(formLevelError(values)).toBe("Ends must be after starts.");
    });

    it("rejects endsAt before startsAt", () => {
        const values = {
            ...emptyFormValues(),
            startsAt: new Date("2026-10-08T18:00:00.000Z"),
            endsAt: new Date("2026-10-01T21:00:00.000Z"),
        };

        expect(formLevelError(values)).toBe("Ends must be after starts.");
    });

    it("returns a plain string, not an object (avoids '[object Object]' rendering)", () => {
        const values = {
            ...emptyFormValues(),
            startsAt: new Date("2026-10-08T18:00:00.000Z"),
            endsAt: new Date("2026-10-01T21:00:00.000Z"),
        };

        expect(typeof formLevelError(values)).toBe("string");
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
