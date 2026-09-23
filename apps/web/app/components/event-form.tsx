"use client";

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { Loader2Icon } from "lucide-react";
import { createEventInput } from "@repo/contracts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { issuesByField, toEventInput, venueIsEmpty, type EventFormValues } from "@/lib/event-form";
import { imageUrl } from "@/lib/events";
import { colors, radius, typography } from "@/styles/tokens.stylex";

const spin = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });

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
            onSubmit: ({ value }: { value: EventFormValues }) => {
                if (venueIsEmpty(value.venue)) return undefined;

                const missing = (["line1", "city", "country"] as const).filter(
                    (key) => value.venue[key].trim() === "",
                );

                // A plain string, not { form: "..." }: the subscriber below renders
                // this value directly, and an object stringifies to "[object Object]".
                return missing.length > 0
                    ? "Street, city and country are required when a venue is given."
                    : undefined;
            },
        },
        onSubmit: async ({ value }) => {
            setSubmitError(null);
            setFieldErrors({});

            // The contract is the authority; the field rules above are just fast feedback.
            const parsed = createEventInput.safeParse(
                toEventInput(value, { imageKey: null, addressId: null }),
            );

            if (!parsed.success) {
                setFieldErrors(issuesByField(parsed.error.issues));
                return;
            }

            try {
                await onSubmit(value);
            } catch (error) {
                // The form keeps its values so the user can retry — see the
                // partial-failure note in the design doc.
                setSubmitError(error instanceof Error ? error.message : "Something went wrong");
            }
        },
    });

    return (
        <form
            {...stylex.props(styles.form)}
            onSubmit={(event) => {
                event.preventDefault();
                form.handleSubmit();
            }}>
            {submitError && <div {...stylex.props(styles.banner, typography.sm)}>{submitError}</div>}

            <form.Field
                name="name"
                validators={{
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
                        {(field.state.meta.errors.length > 0 || fieldErrors.name) && (
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
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                        />
                    </div>
                )}
            </form.Field>

            <div {...stylex.props(styles.row)}>
                <form.Field name="startsAt">
                    {(field) => (
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="startsAt">Starts</Label>
                            <Input
                                id="startsAt"
                                type="datetime-local"
                                value={toLocalInput(field.state.value)}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(fromLocalInput(event.target.value))}
                            />
                        </div>
                    )}
                </form.Field>

                <form.Field name="endsAt">
                    {(field) => (
                        <div {...stylex.props(styles.field)}>
                            <Label htmlFor="endsAt">Ends</Label>
                            <Input
                                id="endsAt"
                                type="datetime-local"
                                value={toLocalInput(field.state.value)}
                                onBlur={field.handleBlur}
                                onChange={(event) => field.handleChange(fromLocalInput(event.target.value))}
                            />
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

                {(
                    [
                        ["venue.label", "Venue name"],
                        ["venue.line1", "Street"],
                        ["venue.line2", "Street line 2"],
                        ["venue.city", "City"],
                        ["venue.region", "Region"],
                        ["venue.postalCode", "Postal code"],
                        ["venue.country", "Country"],
                    ] as const
                ).map(([name, label]) => (
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

/** `datetime-local` speaks "YYYY-MM-DDTHH:mm" in local time, with no offset. */
const toLocalInput = (value: Date | null) => {
    if (!value) return "";

    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

const fromLocalInput = (value: string) => (value === "" ? null : new Date(value));
