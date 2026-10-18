"use client";

import * as stylex from "@stylexjs/stylex";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { colors, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    field: { display: "grid", gap: "0.5rem" },
    error: { color: colors.destructive },
});

export type TextFieldProps = {
    id: string;
    label: string;
    type?: "text" | "email" | "password";
    autoComplete?: string;
    /** The FormData key — what a Server Action reads. */
    name?: string;
    /** Controlled use: value + onChange. Uncontrolled (Server Action forms): defaultValue. */
    value?: string;
    onChange?: (value: string) => void;
    defaultValue?: string;
    onBlur?: () => void;
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    error?: string;
};

/** Label + Input + inline error, so every auth form renders a field the same way. */
export function TextField({
    id,
    label,
    type = "text",
    autoComplete,
    name,
    value,
    onChange,
    defaultValue,
    onBlur,
    required,
    minLength,
    maxLength,
    error,
}: TextFieldProps) {
    const errorId = `${id}-error`;

    return (
        <div {...stylex.props(styles.field)}>
            <Label htmlFor={id}>{label}</Label>
            <Input
                // Base UI's input doesn't take a new defaultValue after mount
                // (it warns); a Server Action echoing the typed value remounts it.
                key={defaultValue}
                id={id}
                name={name}
                type={type}
                autoComplete={autoComplete}
                value={value}
                defaultValue={defaultValue}
                required={required}
                minLength={minLength}
                maxLength={maxLength}
                onBlur={onBlur}
                onChange={onChange && ((event) => onChange(event.target.value))}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
            />
            {error && (
                <p id={errorId} {...stylex.props(styles.error, typography.sm)}>
                    {error}
                </p>
            )}
        </div>
    );
}
