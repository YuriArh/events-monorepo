import { createEventInput } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type EventRecord } from "./events";
import {
    emptyFormValues,
    formLevelError,
    issuesByField,
    resolveAddressId,
    resolveImageKey,
    toEventInput,
    toFormValues,
    venueIsEmpty,
} from "./event-form";

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

describe("resolveAddressId", () => {
    const api = () => ({
        create: vi.fn().mockResolvedValue({ id: "new-address" }),
        update: vi.fn().mockResolvedValue({ id: "existing" }),
    });

    it("returns null and writes nothing when the venue is empty", async () => {
        const calls = api();

        await expect(resolveAddressId(emptyFormValues(), null, calls)).resolves.toBeNull();
        expect(calls.create).not.toHaveBeenCalled();
        expect(calls.update).not.toHaveBeenCalled();
    });

    it("creates an address when the event has none", async () => {
        const calls = api();
        const values = {
            ...emptyFormValues(),
            venue: { ...emptyFormValues().venue, line1: "1 Civic Square", city: "Amsterdam", country: "NL" },
        };

        await expect(resolveAddressId(values, null, calls)).resolves.toBe("new-address");
        expect(calls.create).toHaveBeenCalledWith(
            expect.objectContaining({ line1: "1 Civic Square", city: "Amsterdam", country: "NL" }),
        );
    });

    // Safe because the relation is 1:1 — no other event can reference this address.
    it("updates in place when the event already has an address", async () => {
        const calls = api();
        const values = {
            ...emptyFormValues(),
            venue: { ...emptyFormValues().venue, line1: "2 New Road", city: "Rotterdam", country: "NL" },
        };

        await expect(resolveAddressId(values, "existing", calls)).resolves.toBe("existing");
        expect(calls.update).toHaveBeenCalledWith("existing", expect.objectContaining({ city: "Rotterdam" }));
    });

    it("detaches when the venue is cleared on an event that had one", async () => {
        const calls = api();

        await expect(resolveAddressId(emptyFormValues(), "existing", calls)).resolves.toBeNull();
        expect(calls.update).not.toHaveBeenCalled();
    });

    // Regression: the address contract's issues key by "city", "line1", etc.,
    // but the form only renders inline errors under "venue.city",
    // "venue.line1", etc. Without this prefixing, a server rejection wrote to
    // dead state nothing reads.
    it("prefixes a create rejection's issue paths with 'venue'", async () => {
        const values = {
            ...emptyFormValues(),
            venue: { ...emptyFormValues().venue, line1: "1 Civic Square", city: "Amsterdam", country: "NL" },
        };
        const calls = {
            create: vi.fn().mockRejectedValue(
                new ApiError("Validation error", 400, [
                    { path: ["city"], message: "Too big: expected string to have <=255 characters" },
                ]),
            ),
            update: vi.fn(),
        };

        const failure = resolveAddressId(values, null, calls);

        await expect(failure).rejects.toBeInstanceOf(ApiError);
        await failure.catch((error: ApiError) => {
            expect(error.issues).toEqual([
                { path: ["venue", "city"], message: "Too big: expected string to have <=255 characters" },
            ]);
        });
    });

    it("prefixes an update rejection's issue paths with 'venue'", async () => {
        const values = {
            ...emptyFormValues(),
            venue: { ...emptyFormValues().venue, line1: "2 New Road", city: "Rotterdam", country: "NL" },
        };
        const calls = {
            create: vi.fn(),
            update: vi
                .fn()
                .mockRejectedValue(
                    new ApiError("Validation error", 400, [{ path: ["line1"], message: "Too long" }]),
                ),
        };

        const failure = resolveAddressId(values, "existing", calls);

        await expect(failure).rejects.toBeInstanceOf(ApiError);
        await failure.catch((error: ApiError) => {
            expect(error.issues).toEqual([{ path: ["venue", "line1"], message: "Too long" }]);
        });
    });

    it("rethrows a rejection with no issues unchanged", async () => {
        const values = {
            ...emptyFormValues(),
            venue: { ...emptyFormValues().venue, line1: "1 Civic Square", city: "Amsterdam", country: "NL" },
        };
        const notFound = new ApiError("Address not found", 404);
        const calls = { create: vi.fn().mockRejectedValue(notFound), update: vi.fn() };

        await expect(resolveAddressId(values, null, calls)).rejects.toBe(notFound);
    });
});

describe("formLevelError", () => {
    it("is undefined for an empty venue and no dates", () => {
        expect(formLevelError(emptyFormValues())).toBeUndefined();
    });

    it("flags a partial venue", () => {
        const values = { ...emptyFormValues(), venue: { ...emptyFormValues().venue, city: "Amsterdam" } };

        expect(formLevelError(values)).toBe(
            "Street, city and country are required when a venue is given.",
        );
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
