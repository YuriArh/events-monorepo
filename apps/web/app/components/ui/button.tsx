import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type StyleXStyles, create, props } from "@stylexjs/stylex";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName } from "@/components/ui/utils";

const styles = create({
    base: {
        display: "inline-flex",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.md,
        borderWidth: 0,
        borderStyle: "none",
        backgroundClip: "padding-box",
        fontWeight: 500,
        whiteSpace: "nowrap",
        transitionProperty: "all",
        transitionDuration: "150ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        outline: "none",
        userSelect: "none",
        cursor: {
            default: "pointer",
            ":disabled": "not-allowed",
        },
        pointerEvents: {
            default: null,
            ":disabled": "none",
        },
        opacity: {
            default: 1,
            ":disabled": 0.5,
        },
        transform: {
            default: null,
            ":active": "translateY(1px)",
        },
        boxShadow: {
            default: null,
            ":focus-visible": `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
        },
        ":is(svg)": {
            width: "1rem",
            height: "1rem",
            pointerEvents: "none",
            flexShrink: 0,
        },
    },
    default: {
        backgroundColor: {
            default: colors.primary,
            ":hover": `color-mix(in oklab, ${colors.primary} 80%, transparent)`,
        },
        color: colors.primaryForeground,
    },
    outline: {
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: {
            default: colors.border,
            ":is(.dark, .dark *)": colors.input,
        },
        backgroundColor: {
            default: colors.background,
            ":hover": colors.muted,
            ":is(.dark, .dark *)": `color-mix(in oklab, ${colors.input} 30%, transparent)`,
            ":is(.dark, .dark *):hover": `color-mix(in oklab, ${colors.input} 50%, transparent)`,
        },
        color: {
            default: "inherit",
            ":hover": colors.foreground,
        },
    },
    secondary: {
        backgroundColor: {
            default: colors.secondary,
            ":hover": `color-mix(in oklch, ${colors.secondary}, ${colors.foreground} 5%)`,
        },
        color: colors.secondaryForeground,
    },
    ghost: {
        backgroundColor: {
            default: "transparent",
            ":hover": colors.muted,
            ":is(.dark, .dark *):hover": `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
        },
        color: {
            default: "inherit",
            ":hover": colors.foreground,
        },
    },
    destructive: {
        backgroundColor: {
            default: `color-mix(in oklab, ${colors.destructive} 10%, transparent)`,
            ":hover": `color-mix(in oklab, ${colors.destructive} 20%, transparent)`,
            ":is(.dark, .dark *)": `color-mix(in oklab, ${colors.destructive} 20%, transparent)`,
            ":is(.dark, .dark *):hover": `color-mix(in oklab, ${colors.destructive} 30%, transparent)`,
        },
        color: colors.destructive,
        boxShadow: {
            default: null,
            ":focus-visible": `0 0 0 3px color-mix(in oklab, ${colors.destructive} 20%, transparent)`,
            ":is(.dark, .dark *):focus-visible": `0 0 0 3px color-mix(in oklab, ${colors.destructive} 40%, transparent)`,
        },
    },
    link: {
        backgroundColor: "transparent",
        color: colors.primary,
        textUnderlineOffset: "4px",
        textDecorationLine: {
            default: "none",
            ":hover": "underline",
        },
    },
    sizeDefault: {
        height: "2rem",
        gap: "0.375rem",
        paddingInline: "0.625rem",
        ":is(svg)": {
            width: "1rem",
            height: "1rem",
        },
    },
    sizeXs: {
        height: "1.5rem",
        gap: "0.25rem",
        borderRadius: `min(${radius.md}, 10px)`,
        paddingInline: "0.5rem",
        ":is(svg)": {
            width: "0.75rem",
            height: "0.75rem",
        },
    },
    sizeSm: {
        height: "1.75rem",
        gap: "0.25rem",
        borderRadius: `min(${radius.md}, 12px)`,
        paddingInline: "0.625rem",
        ":is(svg)": {
            width: "1rem",
            height: "1rem",
        },
    },
    sizeLg: {
        height: "2.25rem",
        gap: "0.375rem",
        paddingInline: "0.625rem",
        ":is(svg)": {
            width: "1.125rem",
            height: "1.125rem",
        },
    },
    sizeIcon: {
        height: "2rem",
        width: "2rem",
        paddingInline: 0,
        paddingBlock: 0,
        ":is(svg)": {
            width: "1rem",
            height: "1rem",
        },
    },
    sizeIconXs: {
        height: "1.5rem",
        width: "1.5rem",
        paddingInline: 0,
        paddingBlock: 0,
        borderRadius: `min(${radius.md}, 10px)`,
        ":is(svg)": {
            width: "0.75rem",
            height: "0.75rem",
        },
    },
    sizeIconSm: {
        height: "1.75rem",
        width: "1.75rem",
        paddingInline: 0,
        paddingBlock: 0,
        borderRadius: `min(${radius.md}, 12px)`,
        ":is(svg)": {
            width: "0.875rem",
            height: "0.875rem",
        },
    },
    sizeIconLg: {
        height: "2.25rem",
        width: "2.25rem",
        paddingInline: 0,
        paddingBlock: 0,
        ":is(svg)": {
            width: "1.125rem",
            height: "1.125rem",
        },
    },
});

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

export type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

const variantStyles: Record<ButtonVariant, StyleXStyles> = {
    default: styles.default,
    destructive: styles.destructive,
    ghost: styles.ghost,
    link: styles.link,
    outline: styles.outline,
    secondary: styles.secondary,
};

const sizeStyles: Record<ButtonSize, StyleXStyles> = {
    default: styles.sizeDefault,
    xs: styles.sizeXs,
    sm: styles.sizeSm,
    lg: styles.sizeLg,
    icon: styles.sizeIcon,
    "icon-xs": styles.sizeIconXs,
    "icon-sm": styles.sizeIconSm,
    "icon-lg": styles.sizeIconLg,
};

const sizeTypography: Record<ButtonSize, StyleXStyles> = {
    default: typography.sm,
    xs: typography.xs,
    sm: typography.xs,
    lg: typography.sm,
    icon: typography.sm,
    "icon-xs": typography.xs,
    "icon-sm": typography.xs,
    "icon-lg": typography.sm,
};

export type ButtonProps = Omit<ButtonPrimitive.Props, "style"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
    style?: StyleXStyles;
};

function Button({ className, style, variant = "default", size = "default", ...restProps }: ButtonProps) {
    const styleProps = props(
        styles.base,
        sizeTypography[size],
        variantStyles[variant],
        sizeStyles[size],
        customClassName(className),
        style,
    );

    return (
        <ButtonPrimitive data-slot="button" data-size={size} data-variant={variant} {...restProps} {...styleProps} />
    );
}

export { Button, styles as buttonStyles };
