import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { colors, typography } from "@/styles/tokens.stylex";
import { customClassName, spacing } from "@/components/ui/utils";

const styles = stylex.create({
    root: () => ({
        display: "flex",
        alignItems: "center",
        gap: spacing(2),
        fontWeight: 500,
        userSelect: "none",
        color: "inherit",
    }),
    disabled: {
        opacity: 0.5,
        cursor: "not-allowed",
    },
});

export type LabelProps = Omit<React.ComponentProps<"label">, "style"> & {
    style?: StyleXStyles;
    "data-disabled"?: boolean | string;
};

function Label({ className, style, ...props }: LabelProps) {
    const isDisabled =
        props["data-disabled"] === true ||
        props["data-disabled"] === "" ||
        props["data-disabled"] === "true" ||
        props["aria-disabled"] === true ||
        props["aria-disabled"] === "true";

    return (
        <label
            data-slot="label"
            {...stylex.props(
                styles.root(),
                typography.sm,
                isDisabled && styles.disabled,
                customClassName(className),
                style,
            )}
            {...props}
        />
    );
}

export { Label };
