/** Shapes zod issues (from a client parse or a server 400) for field display. */
export const issuesByField = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
    const byField: Record<string, string> = {};

    for (const issue of issues) {
        const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
        byField[key] ??= issue.message;
    }

    return byField;
};

/** The first error whose key no inline field renders, so it can go in the banner instead of vanishing. */
export const uncoveredMessage = (fields: Record<string, string>, rendered: ReadonlySet<string>) =>
    Object.entries(fields).find(([key]) => !rendered.has(key))?.[1] ?? null;
