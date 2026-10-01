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
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    error?: string;
};

/** Label + Input + inline error, so every auth form renders a field the same way. */
export function TextField({ id, label, type = "text", autoComplete, value, onChange, onBlur, error }: TextFieldProps) {
    const errorId = `${id}-error`;

    return (
        <div {...stylex.props(styles.field)}>
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                autoComplete={autoComplete}
                value={value}
                onBlur={onBlur}
                onChange={(event) => onChange(event.target.value)}
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
