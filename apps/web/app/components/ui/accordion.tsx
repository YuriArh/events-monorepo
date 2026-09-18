import * as stylex from "@stylexjs/stylex";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import type { StyleXStyles } from "@stylexjs/stylex";
import { ChevronDownIcon } from "lucide-react";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName, dimensions, spacing } from "@/components/ui/utils";

const accordionDown = stylex.keyframes({
    from: { height: 0 },
    to: { height: "var(--accordion-panel-height)" },
});

const accordionUp = stylex.keyframes({
    from: { height: "var(--accordion-panel-height)" },
    to: { height: 0 },
});

const styles = stylex.create({
    root: () => ({
        display: "flex",
        flexDirection: "column",
        width: dimensions.percent(100),
    }),
    item: {
        ":not(:last-child)": {
            borderBottomWidth: "1px",
            borderBottomStyle: "solid",
            borderBottomColor: colors.border,
        },
    },
    header: {
        display: "flex",
        margin: 0,
    },
    trigger: () => ({
        position: "relative",
        display: "flex",
        flex: 1,
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: spacing(4),
        borderRadius: radius.md,
        borderTopWidth: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderLeftWidth: 0,
        borderStyle: "none",
        paddingTop: spacing(2.5),
        paddingBottom: spacing(2.5),
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: "left",
        fontWeight: 500,
        fontFamily: "inherit",
        color: colors.foreground,
        outline: "none",
        outlineWidth: {
            default: null,
            ":focus-visible": "1px",
        },
        outlineStyle: {
            default: null,
            ":focus-visible": "solid",
        },
        outlineColor: {
            default: null,
            ":focus-visible": colors.ring,
        },
        textDecorationLine: {
            default: "none",
            ":hover": "underline",
        },
        boxShadow: {
            default: null,
            ":focus-visible": `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
        },
        transitionProperty: "all",
        transitionDuration: "150ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: "pointer",
        backgroundColor: "transparent",
    }),
    triggerDisabled: {
        pointerEvents: "none",
        opacity: 0.5,
    },
    icon: () => ({
        marginLeft: "auto",
        height: dimensions.rem(1),
        width: dimensions.rem(1),
        flexShrink: 0,
        color: colors.mutedForeground,
        pointerEvents: "none",
        transitionProperty: "transform",
        transitionDuration: "200ms",
        transitionTimingFunction: "cubic-bezier(0.87, 0, 0.13, 1)",
    }),
    iconOpen: {
        transform: "rotate(180deg)",
    },
    panel: {
        overflow: "hidden",
    },
    panelOpen: {
        animationName: accordionDown,
        animationDuration: "0.2s",
        animationTimingFunction: "ease-out",
    },
    panelClosed: {
        animationName: accordionUp,
        animationDuration: "0.2s",
        animationTimingFunction: "ease-out",
    },
    contentBody: {
        height: "var(--accordion-panel-height)",
        paddingTop: 0,
        paddingBottom: "0.625rem",
    },
    link: {
        textDecorationLine: "underline",
        textUnderlineOffset: 3,
        color: {
            default: "inherit",
            ":hover": colors.foreground,
        },
    },
    paragraph: {
        marginBottom: {
            default: null,
            ":not(:last-child)": "1rem",
        },
    },
});

export type AccordionProps = Omit<AccordionPrimitive.Root.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function Accordion({ className, style, ...props }: AccordionProps) {
    return (
        <AccordionPrimitive.Root
            data-slot="accordion"
            {...props}
            {...stylex.props(styles.root(), customClassName(className), style)}
        />
    );
}

export type AccordionItemProps = Omit<AccordionPrimitive.Item.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function AccordionItem({ className, style, ...props }: AccordionItemProps) {
    return (
        <AccordionPrimitive.Item
            data-slot="accordion-item"
            {...props}
            {...stylex.props(styles.item, customClassName(className), style)}
        />
    );
}

export type AccordionTriggerProps = Omit<AccordionPrimitive.Trigger.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function AccordionTrigger({ className, children, style, ...props }: AccordionTriggerProps) {
    return (
        <AccordionPrimitive.Header {...stylex.props(styles.header)}>
            <AccordionPrimitive.Trigger
                data-slot="accordion-trigger"
                render={(renderProps, state) => (
                    <button
                        type="button"
                        {...renderProps}
                        {...stylex.props(
                            styles.trigger(),
                            typography.sm,
                            state.disabled && styles.triggerDisabled,
                            customClassName(className),
                            style,
                        )}>
                        {children}
                        <ChevronDownIcon
                            data-slot="accordion-trigger-icon"
                            {...stylex.props(styles.icon(), state.open && styles.iconOpen)}
                        />
                    </button>
                )}
                {...props}
            />
        </AccordionPrimitive.Header>
    );
}

export type AccordionContentProps = Omit<AccordionPrimitive.Panel.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function AccordionContent({ className, children, style, ...props }: AccordionContentProps) {
    return (
        <AccordionPrimitive.Panel
            data-slot="accordion-content"
            className={(state) =>
                stylex.props(
                    styles.panel,
                    typography.sm,
                    state.open ? styles.panelOpen : styles.panelClosed,
                    customClassName(className),
                    style,
                ).className
            }
            {...props}>
            <div {...stylex.props(styles.contentBody)}>{children}</div>
        </AccordionPrimitive.Panel>
    );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent, styles as accordionStyles };
