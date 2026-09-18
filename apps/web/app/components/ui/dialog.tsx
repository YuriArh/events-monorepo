import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { StyleXStyles } from "@stylexjs/stylex";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName, dimensions } from "@/components/ui/utils";

const fadeIn = stylex.keyframes({
    "0%": { opacity: 0 },
    "100%": { opacity: 1 },
});

const fadeOut = stylex.keyframes({
    "0%": { opacity: 1 },
    "100%": { opacity: 0 },
});

const zoomIn95 = stylex.keyframes({
    "0%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.95)" },
    "100%": { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
});

const zoomOut95 = stylex.keyframes({
    "0%": { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
    "100%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.95)" },
});

const styles = stylex.create({
    overlay: {
        position: "fixed",
        inset: 0,
        isolation: "isolate",
        zIndex: 50,
        backgroundColor: "color-mix(in oklab, black 10%, transparent)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        animationDuration: "100ms",
        animationFillMode: "forwards",
    },
    overlayOpen: {
        animationName: fadeIn,
    },
    overlayClosed: {
        animationName: fadeOut,
    },
    content: () => ({
        position: "fixed",
        top: "50%",
        left: "50%",
        zIndex: 50,
        display: "grid",
        width: dimensions.percent(100),
        maxWidth: {
            default: "calc(100% - 2rem)",
            "@media (min-width: 640px)": dimensions.rem(24),
        },
        transform: "translate(-50%, -50%)",
        gap: "1rem",
        borderRadius: radius.md,
        backgroundColor: colors.popover,
        padding: "1rem",
        color: colors.popoverForeground,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${colors.foreground} 10%, transparent)`,
        animationDuration: "100ms",
        animationFillMode: "forwards",
        outline: "none",
    }),
    contentOpen: {
        animationName: zoomIn95,
    },
    contentClosed: {
        animationName: zoomOut95,
    },
    closeButton: {
        position: "absolute",
        top: "0.5rem",
        right: "0.5rem",
    },
    srOnly: () => ({
        position: "absolute",
        width: dimensions.rem(0.0625),
        height: dimensions.rem(0.0625),
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        borderWidth: 0,
    }),
    header: {
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
    },
    footer: {
        marginInline: "-1rem",
        marginBottom: "-1rem",
        display: "flex",
        flexDirection: {
            default: "column-reverse",
            "@media (min-width: 640px)": "row",
        },
        justifyContent: {
            default: "flex-start",
            "@media (min-width: 640px)": "flex-end",
        },
        gap: "0.5rem",
        borderBottomLeftRadius: radius.md,
        borderBottomRightRadius: radius.md,
        borderTopWidth: "1px",
        borderTopStyle: "solid",
        borderTopColor: colors.border,
        backgroundColor: `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
        padding: "1rem",
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

export type DialogProps = DialogPrimitive.Root.Props;

function Dialog({ ...props }: DialogProps) {
    return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export type DialogTriggerProps = DialogPrimitive.Trigger.Props;

function DialogTrigger({ ...props }: DialogTriggerProps) {
    return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export type DialogPortalProps = DialogPrimitive.Portal.Props;

function DialogPortal({ ...props }: DialogPortalProps) {
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export type DialogCloseProps = DialogPrimitive.Close.Props;

function DialogClose({ ...props }: DialogCloseProps) {
    return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export type DialogOverlayProps = Omit<DialogPrimitive.Backdrop.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function DialogOverlay({ className, style, ...props }: DialogOverlayProps) {
    return (
        <DialogPrimitive.Backdrop
            data-slot="dialog-overlay"
            className={(state) =>
                stylex.props(
                    styles.overlay,
                    state.open ? styles.overlayOpen : styles.overlayClosed,
                    customClassName(className),
                    style,
                ).className
            }
            {...props}
        />
    );
}

export type DialogContentProps = Omit<DialogPrimitive.Popup.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
    showCloseButton?: boolean;
};

function DialogContent({ className, children, showCloseButton = true, style, ...props }: DialogContentProps) {
    return (
        <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Popup
                data-slot="dialog-content"
                className={(state) =>
                    stylex.props(
                        styles.content(),
                        typography.sm,
                        state.open ? styles.contentOpen : styles.contentClosed,
                        customClassName(className),
                        style,
                    ).className
                }
                {...props}>
                {children}
                {showCloseButton && (
                    <DialogPrimitive.Close
                        data-slot="dialog-close"
                        render={
                            <Button variant="ghost" size="icon-sm" style={styles.closeButton}>
                                <XIcon size={16} />
                                <span {...stylex.props(styles.srOnly())}>Close</span>
                            </Button>
                        }
                    />
                )}
            </DialogPrimitive.Popup>
        </DialogPortal>
    );
}

export type DialogHeaderProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function DialogHeader({ className, style, ...props }: DialogHeaderProps) {
    return (
        <div data-slot="dialog-header" {...stylex.props(styles.header, customClassName(className), style)} {...props} />
    );
}

export type DialogFooterProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles;
    showCloseButton?: boolean;
};

function DialogFooter({ className, showCloseButton = false, children, style, ...props }: DialogFooterProps) {
    return (
        <div data-slot="dialog-footer" {...stylex.props(styles.footer, customClassName(className), style)} {...props}>
            {children}
            {showCloseButton && <DialogPrimitive.Close render={<Button variant="outline">Close</Button>} />}
        </div>
    );
}

export type DialogTitleProps = Omit<DialogPrimitive.Title.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function DialogTitle({ className, style, ...props }: DialogTitleProps) {
    return (
        <DialogPrimitive.Title
            data-slot="dialog-title"
            {...stylex.props(styles.title, typography.base, customClassName(className), style)}
            {...props}
        />
    );
}

export type DialogDescriptionProps = Omit<DialogPrimitive.Description.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function DialogDescription({ className, style, ...props }: DialogDescriptionProps) {
    return (
        <DialogPrimitive.Description
            data-slot="dialog-description"
            {...stylex.props(styles.description, typography.sm, customClassName(className), style)}
            {...props}
        />
    );
}

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
};
