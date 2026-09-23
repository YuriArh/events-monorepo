import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { StyleXStyles } from "@stylexjs/stylex";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName, dimensions } from "@/components/ui/utils";

const styles = stylex.create({
    positioner: {
        isolation: "isolate",
        zIndex: 50,
    },
    popup: () => ({
        zIndex: 50,
        display: "flex",
        width: dimensions.rem(18),
        transformOrigin: "var(--transform-origin)",
        flexDirection: "column",
        gap: "0.625rem",
        borderRadius: radius.md,
        backgroundColor: colors.popover,
        padding: "0.625rem",
        color: colors.popoverForeground,
        boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), 0 0 0 1px color-mix(in oklab, ${colors.foreground} 10%, transparent)`,
        outline: "none",
        transitionProperty: "opacity, transform",
        transitionDuration: "100ms",
        transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
        opacity: 1,
        transform: "scale(1)",
    }),
    popupHidden: {
        opacity: 0,
        transform: "scale(0.95)",
    },
    header: {
        display: "flex",
        flexDirection: "column",
        gap: "0.125rem",
    },
    title: {
        margin: 0,
        fontWeight: 500,
        fontFamily: "inherit",
    },
    description: {
        margin: 0,
        fontFamily: "inherit",
        color: colors.mutedForeground,
    },
});

const hidden = (s: string | undefined) => s === "starting" || s === "ending";

type PopoverProps = PopoverPrimitive.Root.Props;

function Popover({ ...props }: PopoverProps) {
    return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

type PopoverTriggerProps = PopoverPrimitive.Trigger.Props;

function PopoverTrigger({ ...props }: PopoverTriggerProps) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

type PopoverContentProps = Omit<PopoverPrimitive.Popup.Props, "style"> &
    Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> & {
        className?: string;
        style?: StyleXStyles;
    };

function PopoverContent({
    className,
    style,
    align = "center",
    alignOffset = 0,
    side = "bottom",
    sideOffset = 4,
    ...props
}: PopoverContentProps) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                side={side}
                sideOffset={sideOffset}
                {...stylex.props(styles.positioner)}>
                <PopoverPrimitive.Popup
                    data-slot="popover-content"
                    className={(state) =>
                        stylex.props(
                            styles.popup(),
                            typography.sm,
                            hidden(state.transitionStatus) && styles.popupHidden,
                            customClassName(className),
                            style,
                        ).className
                    }
                    {...props}
                />
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    );
}

type PopoverHeaderProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function PopoverHeader({ className, style, ...props }: PopoverHeaderProps) {
    return (
        <div
            data-slot="popover-header"
            {...stylex.props(styles.header, typography.sm, customClassName(className), style)}
            {...props}
        />
    );
}

type PopoverTitleProps = Omit<PopoverPrimitive.Title.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function PopoverTitle({ className, style, ...props }: PopoverTitleProps) {
    return (
        <PopoverPrimitive.Title
            data-slot="popover-title"
            {...stylex.props(styles.title, customClassName(className), style)}
            {...props}
        />
    );
}

type PopoverDescriptionProps = Omit<PopoverPrimitive.Description.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function PopoverDescription({ className, style, ...props }: PopoverDescriptionProps) {
    return (
        <PopoverPrimitive.Description
            data-slot="popover-description"
            {...stylex.props(styles.description, customClassName(className), style)}
            {...props}
        />
    );
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };

export type {
    PopoverProps,
    PopoverTriggerProps,
    PopoverContentProps,
    PopoverHeaderProps,
    PopoverTitleProps,
    PopoverDescriptionProps,
};
