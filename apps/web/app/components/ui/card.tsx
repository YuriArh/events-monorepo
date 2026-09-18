import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName } from "@/components/ui/utils";

export type CardSize = "default" | "sm";

type CardContextValue = {
    size?: CardSize;
};

const CardContext = React.createContext<CardContextValue>({
    size: "default",
});

const styles = stylex.create({
    card: {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: radius.md,
        backgroundColor: colors.card,
        color: colors.cardForeground,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${colors.foreground} 10%, transparent)`,
        ":has([data-slot=card-footer])": {
            paddingBottom: 0,
        },
        ":has(> img:first-child)": {
            paddingTop: 0,
        },
    },
    cardDefault: {
        gap: "var(--card-spacing, 1rem)",
        paddingTop: "var(--card-spacing, 1rem)",
        paddingBottom: "var(--card-spacing, 1rem)",
    },
    cardSm: {
        gap: "var(--card-spacing, 0.75rem)",
        paddingTop: "var(--card-spacing, 0.75rem)",
        paddingBottom: "var(--card-spacing, 0.75rem)",
    },
    header: {
        display: "grid",
        gridAutoRows: "min-content",
        alignItems: "start",
        gap: "0.25rem",
        borderTopLeftRadius: radius.md,
        borderTopRightRadius: radius.md,
        ":has([data-slot=card-action])": {
            gridTemplateColumns: "1fr auto",
        },
        ":has([data-slot=card-description])": {
            gridTemplateRows: "auto auto",
        },
    },
    headerDefault: {
        paddingInline: "var(--card-spacing, 1rem)",
    },
    headerSm: {
        paddingInline: "var(--card-spacing, 0.75rem)",
    },
    title: {
        fontWeight: 500,
    },
    description: {
        color: colors.mutedForeground,
    },
    action: {
        gridColumnStart: 2,
        gridRowStart: 1,
        gridRowEnd: "span 2",
        alignSelf: "start",
        justifySelf: "end",
    },
    content: {},
    contentDefault: {
        paddingInline: "var(--card-spacing, 1rem)",
    },
    contentSm: {
        paddingInline: "var(--card-spacing, 0.75rem)",
    },
    footer: {
        display: "flex",
        alignItems: "center",
        borderBottomLeftRadius: radius.md,
        borderBottomRightRadius: radius.md,
        borderTopWidth: "1px",
        borderTopStyle: "solid",
        borderTopColor: colors.border,
        backgroundColor: `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
    },
    footerDefault: {
        padding: "var(--card-spacing, 1rem)",
    },
    footerSm: {
        padding: "var(--card-spacing, 0.75rem)",
    },
});

export type CardProps = Omit<React.ComponentProps<"div">, "style"> & {
    size?: CardSize;
    className?: string;
    style?: StyleXStyles | React.CSSProperties;
};

function Card({ className, style, size = "default", children, ...props }: CardProps) {
    const isStyleX = style != null && typeof style === "object" && ("$$css" in style || Array.isArray(style));
    const styleProps = stylex.props(
        styles.card,
        typography.sm,
        size === "sm" ? styles.cardSm : styles.cardDefault,
        customClassName(className),
        isStyleX ? (style as StyleXStyles) : null,
    );
    const inlineStyle = !isStyleX && style ? (style as React.CSSProperties) : undefined;
    return (
        <CardContext.Provider value={{ size }}>
            <div
                data-slot="card"
                data-size={size}
                {...styleProps}
                style={{
                    ...styleProps.style,
                    ...inlineStyle,
                }}
                {...props}>
                {children}
            </div>
        </CardContext.Provider>
    );
}

export type CardHeaderProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles | React.CSSProperties;
};

function CardHeader({ className, style, ...props }: CardHeaderProps) {
    const { size } = React.useContext(CardContext);
    const isStyleX = style != null && typeof style === "object" && ("$$css" in style || Array.isArray(style));
    const styleProps = stylex.props(
        styles.header,
        size === "sm" ? styles.headerSm : styles.headerDefault,
        customClassName(className),
        isStyleX ? (style as StyleXStyles) : null,
    );
    const inlineStyle = !isStyleX && style ? (style as React.CSSProperties) : undefined;
    return (
        <div
            data-slot="card-header"
            {...styleProps}
            style={{
                ...styleProps.style,
                ...inlineStyle,
            }}
            {...props}
        />
    );
}

export type CardTitleProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles | React.CSSProperties;
};

function CardTitle({ className, style, ...props }: CardTitleProps) {
    const { size } = React.useContext(CardContext);
    const isStyleX = style != null && typeof style === "object" && ("$$css" in style || Array.isArray(style));
    const styleProps = stylex.props(
        styles.title,
        size === "sm" ? typography.sm : typography.base,
        customClassName(className),
        isStyleX ? (style as StyleXStyles) : null,
    );
    const inlineStyle = !isStyleX && style ? (style as React.CSSProperties) : undefined;
    return (
        <div
            data-slot="card-title"
            {...styleProps}
            style={{
                ...styleProps.style,
                ...inlineStyle,
            }}
            {...props}
        />
    );
}

export type CardDescriptionProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles | React.CSSProperties;
};

function CardDescription({ className, style, ...props }: CardDescriptionProps) {
    const isStyleX = style != null && typeof style === "object" && ("$$css" in style || Array.isArray(style));
    const styleProps = stylex.props(
        styles.description,
        typography.sm,
        customClassName(className),
        isStyleX ? (style as StyleXStyles) : null,
    );
    const inlineStyle = !isStyleX && style ? (style as React.CSSProperties) : undefined;
    return (
        <div
            data-slot="card-description"
            {...styleProps}
            style={{
                ...styleProps.style,
                ...inlineStyle,
            }}
            {...props}
        />
    );
}

export type CardActionProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles | React.CSSProperties;
};

function CardAction({ className, style, ...props }: CardActionProps) {
    const isStyleX = style != null && typeof style === "object" && ("$$css" in style || Array.isArray(style));
    const styleProps = stylex.props(
        styles.action,
        customClassName(className),
        isStyleX ? (style as StyleXStyles) : null,
    );
    const inlineStyle = !isStyleX && style ? (style as React.CSSProperties) : undefined;
    return (
        <div
            data-slot="card-action"
            {...styleProps}
            style={{
                ...styleProps.style,
                ...inlineStyle,
            }}
            {...props}
        />
    );
}

export type CardContentProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles | React.CSSProperties;
};

function CardContent({ className, style, ...props }: CardContentProps) {
    const { size } = React.useContext(CardContext);
    const isStyleX = style != null && typeof style === "object" && ("$$css" in style || Array.isArray(style));
    const styleProps = stylex.props(
        styles.content,
        size === "sm" ? styles.contentSm : styles.contentDefault,
        customClassName(className),
        isStyleX ? (style as StyleXStyles) : null,
    );
    const inlineStyle = !isStyleX && style ? (style as React.CSSProperties) : undefined;
    return (
        <div
            data-slot="card-content"
            {...styleProps}
            style={{
                ...styleProps.style,
                ...inlineStyle,
            }}
            {...props}
        />
    );
}

export type CardFooterProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles | React.CSSProperties;
};

function CardFooter({ className, style, ...props }: CardFooterProps) {
    const { size } = React.useContext(CardContext);
    const isStyleX = style != null && typeof style === "object" && ("$$css" in style || Array.isArray(style));
    const styleProps = stylex.props(
        styles.footer,
        size === "sm" ? styles.footerSm : styles.footerDefault,
        customClassName(className),
        isStyleX ? (style as StyleXStyles) : null,
    );
    const inlineStyle = !isStyleX && style ? (style as React.CSSProperties) : undefined;
    return (
        <div
            data-slot="card-footer"
            {...styleProps}
            style={{
                ...styleProps.style,
                ...inlineStyle,
            }}
            {...props}
        />
    );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
