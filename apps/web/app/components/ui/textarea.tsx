import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName, dimensions } from "@/components/ui/utils";

const styles = stylex.create({
    root: () => ({
        display: "flex",
        fieldSizing: "content",
        minHeight: dimensions.rem(4),
        width: dimensions.percent(100),
        borderRadius: radius.md,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: {
            default: colors.input,
            ":focus-visible": colors.ring,
        },
        backgroundColor: {
            default: "transparent",
            ":disabled": `color-mix(in oklab, ${colors.input} 50%, transparent)`,
        },
        paddingInline: "0.625rem",
        paddingBlock: "0.5rem",
        color: colors.foreground,
        transitionProperty: "color, background-color, border-color, box-shadow",
        transitionDuration: "150ms",
        transitionTimingFunction: "ease-in-out",
        outline: "none",
        "::placeholder": {
            color: colors.mutedForeground,
        },
        boxShadow: {
            default: "none",
            ":focus-visible": `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
        },
        cursor: {
            default: "auto",
            ":disabled": "not-allowed",
        },
        opacity: {
            default: 1,
            ":disabled": 0.5,
        },
    }),
    ariaInvalid: {
        borderColor: colors.destructive,
        boxShadow: `0 0 0 3px color-mix(in oklab, ${colors.destructive} 20%, transparent)`,
    },
});

export type TextareaProps = Omit<React.ComponentProps<"textarea">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function Textarea({ className, style, "aria-invalid": ariaInvalid, ...props }: TextareaProps) {
    const isInvalid = ariaInvalid === true || ariaInvalid === "true";

    return (
        <textarea
            data-slot="textarea"
            aria-invalid={ariaInvalid}
            {...stylex.props(
                styles.root(),
                typography.sm,
                isInvalid && styles.ariaInvalid,
                customClassName(className),
                style as StyleXStyles,
            )}
            {...props}
        />
    );
}

export { Textarea };
