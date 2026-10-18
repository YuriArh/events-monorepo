/** What a Server Action hands back to its form (via useActionState). */
export type FormState = {
    fieldErrors?: Record<string, string>;
    formError?: string;
    /** Success text for forms that stay on the page. */
    message?: string;
    /** Echoed input (never passwords): React 19 resets the form after an action. */
    values?: Record<string, string>;
};
