import type * as React from "react";

import * as stylex from "@stylexjs/stylex";
import { Input as InputPrimitive } from "@base-ui/react/input";
import type { StyleXStyles } from "@stylexjs/stylex";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName, dimensions } from "@/components/ui/utils";

const styles = stylex.create({
    root: () => ({
        boxSizing: "border-box",
        height: dimensions.rem(2),
        width: dimensions.percent(100),
        minWidth: 0,
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
        paddingInline: "0.75rem",
        paddingBlock: "0.25rem",
        fontFamily: "inherit",
        color: colors.foreground,
        transitionProperty: "color, background-color, border-color, box-shadow",
        transitionDuration: "150ms",
        transitionTimingFunction: "ease-in-out",
        outline: "none",
        "::placeholder": {
            color: colors.mutedForeground,
        },
        "::file-selector-button": {
            display: "inline-flex",
            height: dimensions.rem(1.5),
            borderWidth: 0,
            backgroundColor: "transparent",
            fontWeight: 500,
            color: colors.foreground,
        },
        boxShadow: {
            default: "none",
            ":focus-visible": `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
        },
        pointerEvents: {
            default: null,
            ":disabled": "none",
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

export type InputProps = Omit<React.ComponentProps<"input">, "style"> & {
    style?: StyleXStyles;
};

function Input({ className, style, type, "aria-invalid": ariaInvalid, ...props }: InputProps) {
    return (
        <InputPrimitive
            type={type}
            data-slot="input"
            aria-invalid={ariaInvalid}
            {...stylex.props(
                styles.root(),
                typography.sm,
                ariaInvalid && ariaInvalid !== "false" && styles.ariaInvalid,
                customClassName(className),
                style as StyleXStyles,
            )}
            {...props}
        />
    );
}

export { Input };
