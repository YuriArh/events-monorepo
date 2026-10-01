/** The first error whose key no inline field renders, so it can go in the banner instead of vanishing. */
export const uncoveredMessage = (fields: Record<string, string>, rendered: ReadonlySet<string>) =>
    Object.entries(fields).find(([key]) => !rendered.has(key))?.[1] ?? null;
