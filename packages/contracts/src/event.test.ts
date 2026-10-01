import { describe, expect, it } from "vitest";

import { createEventInput, createEventPayload, imageKeySchema } from "./index.js";

describe("createEventInput (wire shape)", () => {
  it("keeps dates as ISO strings", () => {
    const parsed = createEventInput.parse({
      name: "Team offsite",
      startsAt: "2026-10-01T18:00:00.000Z",
    });

    expect(parsed.startsAt).toBe("2026-10-01T18:00:00.000Z");
  });

  it("rejects a datetime without an offset", () => {
    expect(() => createEventInput.parse({ name: "x", startsAt: "2026-10-01T18:00:00" })).toThrow();
  });
});

describe("createEventPayload (server shape)", () => {
  it("coerces dates to Date objects", () => {
    const parsed = createEventPayload.parse({
      name: "Team offsite",
      startsAt: "2026-10-01T18:00:00.000Z",
    });

    expect(parsed.startsAt).toBeInstanceOf(Date);
  });

  it("shares the non-date rules with the wire shape", () => {
    expect(() => createEventPayload.parse({ name: "" })).toThrow();
    expect(() => createEventInput.parse({ name: "" })).toThrow();
  });
});

describe("event venue", () => {
  const venue = { line1: "1 Civic Square", city: "Amsterdam", country: "NL" };

  it("accepts a nested address, null, or nothing", () => {
    expect(createEventInput.parse({ name: "A", address: venue }).address).toMatchObject(venue);
    expect(createEventInput.parse({ name: "A", address: null }).address).toBeNull();
    expect(createEventInput.parse({ name: "A" }).address).toBeUndefined();
  });

  it("rejects an incomplete address with a nested path", () => {
    const result = createEventInput.safeParse({ name: "A", address: { ...venue, city: "" } });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["address", "city"]);
  });

  it("drops the removed addressId field", () => {
    expect(createEventInput.parse({ name: "A", addressId: "x" })).not.toHaveProperty("addressId");
  });
});

describe("imageKeySchema", () => {
  it("accepts the keys the upload endpoint generates", () => {
    for (const extension of ["jpg", "png", "webp", "gif"]) {
      expect(imageKeySchema.safeParse(`0123456789abcdef0123456789abcdef.${extension}`).success).toBe(true);
    }
  });

  it.each([
    ["an upper-case name", "0123456789ABCDEF0123456789ABCDEF.png"],
    ["an upper-case extension", "0123456789abcdef0123456789abcdef.PNG"],
    ["an extension the generator never uses", "0123456789abcdef0123456789abcdef.jpeg"],
    ["a non-hex name", "0123456789abcdef0123456789abcdeg.png"],
    ["a name of the wrong length", "abc.png"],
  ])("rejects %s", (_label, key) => {
    expect(imageKeySchema.safeParse(key).success).toBe(false);
  });
});
