import { describe, expect, it } from "vitest";

import { toTimeInput, withDate, withTime } from "./date-time";

describe("withTime", () => {
    it("sets the time on an existing date", () => {
        const result = withTime(new Date(2026, 9, 1, 9, 30), "18:45");

        expect(result?.getHours()).toBe(18);
        expect(result?.getMinutes()).toBe(45);
        expect(result?.getDate()).toBe(1);
    });

    it("returns null when there is no date yet", () => {
        expect(withTime(null, "18:45")).toBeNull();
    });

    it("ignores an incomplete time string", () => {
        const date = new Date(2026, 9, 1, 9, 30);

        expect(withTime(date, "")?.getHours()).toBe(9);
    });
});

describe("withDate", () => {
    it("keeps the existing time when the day changes", () => {
        const result = withDate(new Date(2026, 9, 1, 18, 45), new Date(2026, 9, 8));

        expect(result?.getDate()).toBe(8);
        expect(result?.getHours()).toBe(18);
        expect(result?.getMinutes()).toBe(45);
    });

    it("defaults to midnight when there was no previous value", () => {
        const result = withDate(null, new Date(2026, 9, 8));

        expect(result?.getHours()).toBe(0);
        expect(result?.getMinutes()).toBe(0);
    });

    it("clears the value when no day is given", () => {
        expect(withDate(new Date(2026, 9, 1), null)).toBeNull();
    });
});

describe("toTimeInput", () => {
    it("formats as zero-padded HH:mm", () => {
        expect(toTimeInput(new Date(2026, 9, 1, 9, 5))).toBe("09:05");
    });

    it("is empty for no date", () => {
        expect(toTimeInput(null)).toBe("");
    });
});
