/**
 * A calendar picks a day and a text field picks a time; these merge one into the
 * other without the second clobbering the first.
 */

const pad = (part: number) => String(part).padStart(2, "0");

/** "HH:mm" for an <input type="time">. */
export const toTimeInput = (value: Date | null) =>
    value ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : "";

/** Applies an "HH:mm" string to an existing date, keeping the day. */
export const withTime = (value: Date | null, time: string): Date | null => {
    if (!value) return null;

    const [hours, minutes] = time.split(":").map(Number);

    if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes))
        return value;

    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);

    return next;
};

/** Applies a chosen day to an existing value, keeping the time already set. */
export const withDate = (value: Date | null, day: Date | null): Date | null => {
    if (!day) return null;

    const next = new Date(day);
    next.setHours(value?.getHours() ?? 0, value?.getMinutes() ?? 0, 0, 0);

    return next;
};
