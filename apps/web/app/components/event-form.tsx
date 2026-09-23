"use client";

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { Loader2Icon } from "lucide-react";
import { createEventInput } from "@repo/contracts";

import { DateTimePicker } from "@/components/date-time-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formLevelError, issuesByField, toEventInput, type EventFormValues } from "@/lib/event-form";
import { ApiError, imageUrl } from "@/lib/events";
import { colors, radius, typography } from "@/styles/tokens.stylex";

const spin = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });

/** Field names this form renders an inline error under — kept in one place so
 * the banner logic below can tell an issue with inline coverage from one that
 * would otherwise be silent. */
const VENUE_FIELDS = [
    ["venue.label", "Venue name"],
    ["venue.line1", "Street"],
    ["venue.line2", "Street line 2"],
    ["venue.city", "City"],
    ["venue.region", "Region"],
    ["venue.postalCode", "Postal code"],
    ["venue.country", "Country"],
] as const;

const INLINE_FIELDS = new Set<string>([
    "name",
    "description",
    "startsAt",
    "endsAt",
    ...VENUE_FIELDS.map(([name]) => name),
]);

/**
 * Picks the banner message for a set of field errors. The banner is a last
 * resort for issues nothing renders inline — if every issue already has an
 * inline renderer, showing the same message a second time in the banner is
 * just noise (see F2's "double-reported message").
 */
function bannerMessage(fields: Record<string, string>, fallback: string): string | null {
    if (Object.keys(fields).length === 0) return fallback;

    const uncovered = Object.entries(fields).find(([field]) => !INLINE_FIELDS.has(field));
    return uncovered ? uncovered[1] : null;
}

const styles = stylex.create({
    form: { display: "flex", flexDirection: "column", gap: "1.5rem" },
    field: { display: "grid", gap: "0.5rem" },
    row: {
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: { default: "1fr", "@media (min-width: 640px)": "1fr 1fr" },
    },
    error: { color: colors.destructive },
    banner: {
        borderRadius: radius.lg,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: `color-mix(in oklab, ${colors.destructive} 30%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${colors.destructive} 10%, transparent)`,
        color: colors.destructive,
        paddingInline: "1rem",
        paddingBlock: "0.75rem",
    },
    actions: { display: "flex", justifyContent: "flex-end", gap: "0.5rem" },
    preview: { width: "8rem", height: "8rem", objectFit: "cover", borderRadius: radius.md },
    imageRow: { display: "flex", alignItems: "center", gap: "1rem" },
    spinner: {
        animationName: spin,
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
    section: {
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        borderTopWidth: "1px",
        borderTopStyle: "solid",
        borderTopColor: colors.border,
        paddingTop: "1.5rem",
    },
    sectionTitle: { fontWeight: 500 },
    hint: { color: colors.mutedForeground },
});

function ImagePreview({ file, existingKey }: { file: File | null; existingKey: string | null }) {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setObjectUrl(null);
            return;
        }

        const url = URL.createObjectURL(file);
        setObjectUrl(url);

        return () => URL.revokeObjectURL(url);
    }, [file]);

    const src = objectUrl ?? (existingKey ? imageUrl(existingKey) : null);

    if (!src) return null;

    // next/image can't take a blob: URL (the preview of a not-yet-uploaded
    // file) cleanly, so a plain <img> is the correct choice here.
    // biome-ignore lint/performance/noImgElement: object/blob URL preview, next/image doesn't support it
    return <img src={src} alt="" {...stylex.props(styles.preview)} />;
}

export type EventFormProps = {
    initialValues: EventFormValues;
    submitLabel: string;
    onSubmit: (values: EventFormValues) => Promise<void>;
    onCancel: () => void;
};

export function EventForm({ initialValues, submitLabel, onSubmit, onCancel }: EventFormProps) {
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const form = useForm({
        defaultValues: initialValues,
        validators: {
            onSubmit: ({ value }: { value: EventFormValues }) => formLevelError(value),
        },
        onSubmit: async ({ value }) => {
            // The contract is the authority; the field rules above are just fast feedback.
            const parsed = createEventInput.safeParse(
                toEventInput(value, { imageKey: null, addressId: null }),
            );

            if (!parsed.success) {
                const fields = issuesByField(parsed.error.issues);
                setFieldErrors(fields);
                // Not every field has a dedicated inline renderer, so also surface
                // the banner — but only for issues nothing else shows, so a
                // covered field's message isn't reported twice (F2).
                setSubmitError(bannerMessage(fields, "Please fix the errors below."));
                return;
            }

            try {
                await onSubmit(value);
            } catch (error) {
                // The form keeps its values so the user can retry — see the
                // partial-failure note in the design doc.
                if (error instanceof ApiError && error.issues) {
                    const fields = issuesByField(error.issues);
                    setFieldErrors(fields);
                    // `resolveAddressId` prefixes address-contract issue paths
                    // ("city", "line1", ...) with "venue" before this catch ever
                    // sees them, so `fields` keys line up with the inline
                    // renderers below. The banner is then only for whatever, if
                    // anything, still has no inline renderer.
                    setSubmitError(bannerMessage(fields, error.message));
                } else {
                    setSubmitError(error instanceof Error ? error.message : "Something went wrong");
                }
            }
        },
    });

    return (
        <form
            {...stylex.props(styles.form)}
            onSubmit={(event) => {
                event.preventDefault();
                // Cleared here, at the start of every submit attempt, rather than
                // inside the `onSubmit` handler above: TanStack Form skips that
                // handler entirely when `validators.onSubmit` (the date-range /
                // venue rule) blocks the submission, which would otherwise leave
                // a stale banner and stale field errors on screen (F3).
                setSubmitError(null);
                setFieldErrors({});
                form.handleSubmit();
            }}>
            {submitError && <div {...stylex.props(styles.banner, typography.sm)}>{submitError}</div>}

            <form.Field
                name="name"
                validators={{
                    // onMount gives an untouched, empty form a mount-time error so
                    // canSubmit reflects validity from the start (tanstack/form-core
                    // otherwise reports canSubmit: true until the first submit
                    // attempt or a touch). onChange keeps that feedback live as the
                    // user types.
                    onMount: ({ value }: { value: string }) =>
                        value.trim() === "" ? "Name is required" : undefined,
                    onChange: ({ value }: { value: string }) =>
                        value.trim() === "" ? "Name is required" : undefined,
                }}>
                {(field) => (
                    <div {...stylex.props(styles.field)}>
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="e.g. Team offsite"
                        />
                        {/* Only show the error once the field has been touched: the
                            onMount validator exists so canSubmit is accurate on an
                            untouched, empty form, not to scold the user before they've
                            typed anything. */}
                        {field.state.meta.isTouched &&
                            (field.state.meta.errors.length > 0 || fieldErrors.name) && (
                                <p {...stylex.props(styles.error, typography.sm)}>
                                    {String(field.state.meta.errors[0] ?? fieldErrors.name)}
                                </p>
                            )}
                    </div>
                )}
            </form.Field>

            <form.Field name="description">
                {(field) => (
                    <div {...stylex.props(styles.field)}>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            rows={4}
                            maxLength={2000}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                        />
                        {fieldErrors.description && (
                            <p {...stylex.props(styles.error, typography.sm)}>{fieldErrors.description}</p>
                        )}
                    </div>
                )}
            </form.Field>

            <div {...stylex.props(styles.row)}>
                <form.Field name="startsAt">
                    {(field) => (
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="startsAt">Starts</Label>
                            <DateTimePicker
                                id="startsAt"
                                label="Starts"
                                value={field.state.value}
                                onChange={(value) => field.handleChange(value)}
                            />
                            {fieldErrors.startsAt && (
                                <p {...stylex.props(styles.error, typography.sm)}>{fieldErrors.startsAt}</p>
                            )}
                        </div>
                    )}
                </form.Field>

                <form.Field name="endsAt">
                    {(field) => (
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="endsAt">Ends</Label>
                            <DateTimePicker
                                id="endsAt"
                                label="Ends"
                                value={field.state.value}
                                onChange={(value) => field.handleChange(value)}
                            />
                            {fieldErrors.endsAt && (
                                <p {...stylex.props(styles.error, typography.sm)}>{fieldErrors.endsAt}</p>
                            )}
                        </div>
                    )}
                </form.Field>
            </div>

            <form.Field name="imageFile">
                {(field) => (
                    <div {...stylex.props(styles.field)}>
                        <Label htmlFor="image">Image</Label>
                        <div {...stylex.props(styles.imageRow)}>
                            <ImagePreview
                                file={field.state.value}
                                existingKey={form.state.values.existingImageKey}
                            />
                            <Input
                                id="image"
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={(event) => field.handleChange(event.target.files?.[0] ?? null)}
                            />
                        </div>
                    </div>
                )}
            </form.Field>

            <div {...stylex.props(styles.section)}>
                <div>
                    <p {...stylex.props(styles.sectionTitle)}>Venue</p>
                    <p {...stylex.props(styles.hint, typography.sm)}>
                        Optional. Street, city and country are required together.
                    </p>
                </div>

                {VENUE_FIELDS.map(([name, label]) => (
                    <form.Field key={name} name={name}>
                        {(field) => (
                            <div {...stylex.props(styles.field)}>
                                <Label htmlFor={name}>{label}</Label>
                                <Input
                                    id={name}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(event) => field.handleChange(event.target.value)}
                                />
                                {fieldErrors[name] && (
                                    <p {...stylex.props(styles.error, typography.sm)}>{fieldErrors[name]}</p>
                                )}
                            </div>
                        )}
                    </form.Field>
                ))}
            </div>

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                {(formError) =>
                    formError ? (
                        <p {...stylex.props(styles.error, typography.sm)}>{String(formError)}</p>
                    ) : null
                }
            </form.Subscribe>

            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (
                    <div {...stylex.props(styles.actions)}>
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!canSubmit || isSubmitting}>
                            {isSubmitting && <Loader2Icon {...stylex.props(styles.spinner)} />}
                            {submitLabel}
                        </Button>
                    </div>
                )}
            </form.Subscribe>
        </form>
    );
}
