import { describe, expect, it } from "vitest";

import { createEventInput, createEventPayload } from "./event.js";

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
