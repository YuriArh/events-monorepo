import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type { StyleXStyles } from "@stylexjs/stylex";

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
        isolate: "isolate",
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
        transform: "translate(-50%, -50%)",
        gap: "1rem",
        borderRadius: radius.md,
        backgroundColor: colors.popover,
        padding: "1rem",
        color: colors.popoverForeground,
        outline: "none",
        boxShadow: `0 0 0 1px color-mix(in oklab, ${colors.foreground} 10%, transparent)`,
        animationDuration: "100ms",
        animationFillMode: "forwards",
    }),
    contentSizeDefault: () => ({
        maxWidth: {
            default: dimensions.rem(20),
            "@media (min-width: 640px)": dimensions.rem(24),
        },
    }),
    contentSizeSm: () => ({
        maxWidth: dimensions.rem(20),
    }),
    contentOpen: {
        animationName: zoomIn95,
    },
    contentClosed: {
        animationName: zoomOut95,
    },
    header: {
        display: "grid",
        gridTemplateRows: "auto 1fr",
        placeItems: "center",
        gap: "0.375rem",
        textAlign: "center",
    },
    headerSmDefault: {
        placeItems: {
            "@media (min-width: 640px)": "start",
        },
        textAlign: {
            "@media (min-width: 640px)": "left",
        },
    },
    headerWithMediaDefault: {
        placeItems: {
            default: "center",
            "@media (min-width: 640px)": "start",
        },
        textAlign: {
            default: "center",
            "@media (min-width: 640px)": "left",
        },
        gridTemplateColumns: {
            default: "1fr",
            "@media (min-width: 640px)": "auto 1fr",
        },
        gridTemplateRows: {
            default: "auto auto 1fr",
            "@media (min-width: 640px)": "auto 1fr",
        },
        gap: {
            default: "0.375rem 0",
            "@media (min-width: 640px)": "0.375rem 1rem",
        },
    },
    footer: {
        marginLeft: "-1rem",
        marginRight: "-1rem",
        marginBottom: "-1rem",
        display: "flex",
        flexDirection: {
            default: "column-reverse",
            "@media (min-width: 640px)": "row",
        },
        gap: "0.5rem",
        borderBottomLeftRadius: radius.md,
        borderBottomRightRadius: radius.md,
        borderTopWidth: "1px",
        borderTopStyle: "solid",
        borderTopColor: colors.border,
        backgroundColor: `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
        padding: "1rem",
        justifyContent: {
            "@media (min-width: 640px)": "flex-end",
        },
    },
    footerSizeSm: {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
    media: () => ({
        marginBottom: "0.5rem",
        display: "inline-flex",
        height: dimensions.rem(2.5),
        width: dimensions.rem(2.5),
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.md,
        backgroundColor: colors.muted,
        ":is(svg)": {
            width: dimensions.rem(1.5),
            height: dimensions.rem(1.5),
        },
    }),
    mediaDefault: {
        marginBottom: {
            default: "0.5rem",
            "@media (min-width: 640px)": "0",
        },
        gridRow: {
            default: "auto",
            "@media (min-width: 640px)": "1 / span 2",
        },
        gridColumn: {
            default: "auto",
            "@media (min-width: 640px)": "1",
        },
        alignSelf: {
            default: "center",
            "@media (min-width: 640px)": "start",
        },
    },
    title: {
        margin: 0,
        fontWeight: 500,
        fontFamily: "inherit",
    },
    titleWithMediaDefault: {
        gridColumn: {
            default: "auto",
            "@media (min-width: 640px)": "2",
        },
        gridRow: {
            default: "auto",
            "@media (min-width: 640px)": "1",
        },
    },
    description: {
        margin: 0,
        color: colors.mutedForeground,
        fontFamily: "inherit",
        textWrap: {
            default: "balance",
            "@media (min-width: 768px)": "pretty",
        },
        ":is(a)": {
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            color: {
                default: "inherit",
                ":hover": colors.foreground,
            },
        },
    },
    descriptionWithMediaDefault: {
        gridColumn: {
            default: "auto",
            "@media (min-width: 640px)": "2",
        },
        gridRow: {
            default: "auto",
            "@media (min-width: 640px)": "2",
        },
    },
});

export type AlertDialogProps = AlertDialogPrimitive.Root.Props;

function AlertDialog({ ...props }: AlertDialogProps) {
    return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

export type AlertDialogTriggerProps = AlertDialogPrimitive.Trigger.Props;

function AlertDialogTrigger({ ...props }: AlertDialogTriggerProps) {
    return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

export type AlertDialogPortalProps = AlertDialogPrimitive.Portal.Props;

function AlertDialogPortal({ ...props }: AlertDialogPortalProps) {
    return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

export type AlertDialogOverlayProps = Omit<AlertDialogPrimitive.Backdrop.Props, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function AlertDialogOverlay({ className, style, ...props }: AlertDialogOverlayProps) {
    return (
        <AlertDialogPrimitive.Backdrop
            data-slot="alert-dialog-overlay"
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

type AlertDialogContentContextValue = {
    size: "default" | "sm";
};

const AlertDialogContentContext = React.createContext<AlertDialogContentContextValue>({
    size: "default",
});

export type AlertDialogContentProps = Omit<AlertDialogPrimitive.Popup.Props, "style"> & {
    className?: string;
    size?: "default" | "sm";
    style?: StyleXStyles;
};

function AlertDialogContent({ className, size = "default", style, children, ...props }: AlertDialogContentProps) {
    return (
        <AlertDialogPortal>
            <AlertDialogOverlay />
            <AlertDialogPrimitive.Popup
                data-slot="alert-dialog-content"
                data-size={size}
                className={(state) =>
                    stylex.props(
                        styles.content(),
                        typography.sm,
                        size === "sm" ? styles.contentSizeSm() : styles.contentSizeDefault(),
                        state.open ? styles.contentOpen : styles.contentClosed,
                        customClassName(className),
                        style,
                    ).className
                }
                {...props}>
                <AlertDialogContentContext.Provider value={{ size }}>{children}</AlertDialogContentContext.Provider>
            </AlertDialogPrimitive.Popup>
        </AlertDialogPortal>
    );
}

const MEDIA_SLOT = Symbol.for("stylex-ui.alert-dialog-media");

type MediaComponent = {
    displayName?: string;
    name?: string;
    [MEDIA_SLOT]?: boolean;
};

type AlertDialogHeaderContextValue = {
    hasMedia: boolean;
    setHasMedia: (has: boolean) => void;
};

const AlertDialogHeaderContext = React.createContext<AlertDialogHeaderContextValue>({
    hasMedia: false,
    setHasMedia: () => {},
});

function isMediaElement(child: React.ReactNode): boolean {
    if (!React.isValidElement(child)) {
        return false;
    }
    if (child.type === AlertDialogMedia) {
        return true;
    }
    if (typeof child.type === "function" || typeof child.type === "object") {
        const comp = child.type as unknown as MediaComponent;
        if (comp[MEDIA_SLOT] === true || comp.displayName === "AlertDialogMedia" || comp.name === "AlertDialogMedia") {
            return true;
        }
    }
    if (child.props && typeof child.props === "object" && "data-slot" in child.props) {
        return (child.props as { "data-slot"?: string })["data-slot"] === "alert-dialog-media";
    }
    return false;
}

export type AlertDialogHeaderProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function AlertDialogHeader({ className, style, children, ...props }: AlertDialogHeaderProps) {
    const { size } = React.useContext(AlertDialogContentContext);
    const [hasMediaState, setHasMediaState] = React.useState(false);

    const hasMediaFromChildren = React.Children.toArray(children).some(isMediaElement);

    const hasMedia = hasMediaState || hasMediaFromChildren;

    return (
        <AlertDialogHeaderContext.Provider value={{ hasMedia, setHasMedia: setHasMediaState }}>
            <div
                data-slot="alert-dialog-header"
                {...stylex.props(
                    styles.header,
                    size === "default" && !hasMedia && styles.headerSmDefault,
                    size === "default" && hasMedia && styles.headerWithMediaDefault,
                    customClassName(className),
                    style,
                )}
                {...props}>
                {children}
            </div>
        </AlertDialogHeaderContext.Provider>
    );
}

export type AlertDialogFooterProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    size?: "default" | "sm";
    style?: StyleXStyles;
};

function AlertDialogFooter({ className, size: sizeProp, style, ...props }: AlertDialogFooterProps) {
    const { size: contextSize } = React.useContext(AlertDialogContentContext);
    const size = sizeProp ?? contextSize;
    return (
        <div
            data-slot="alert-dialog-footer"
            {...stylex.props(styles.footer, size === "sm" && styles.footerSizeSm, customClassName(className), style)}
            {...props}
        />
    );
}

export type AlertDialogMediaProps = Omit<React.ComponentProps<"div">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function AlertDialogMedia({ className, style, ...props }: AlertDialogMediaProps) {
    const { size } = React.useContext(AlertDialogContentContext);
    const { setHasMedia } = React.useContext(AlertDialogHeaderContext);

    React.useEffect(() => {
        setHasMedia(true);
    }, [setHasMedia]);

    return (
        <div
            data-slot="alert-dialog-media"
            {...stylex.props(
                styles.media(),
                size === "default" && styles.mediaDefault,
                customClassName(className),
                style,
            )}
            {...props}
        />
    );
}

AlertDialogMedia.displayName = "AlertDialogMedia";
(AlertDialogMedia as unknown as MediaComponent)[MEDIA_SLOT] = true;

export type AlertDialogTitleProps = Omit<React.ComponentProps<typeof AlertDialogPrimitive.Title>, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function AlertDialogTitle({ className, style, ...props }: AlertDialogTitleProps) {
    const { size } = React.useContext(AlertDialogContentContext);
    const { hasMedia } = React.useContext(AlertDialogHeaderContext);
    return (
        <AlertDialogPrimitive.Title
            data-slot="alert-dialog-title"
            {...stylex.props(
                styles.title,
                typography.base,
                size === "default" && hasMedia && styles.titleWithMediaDefault,
                customClassName(className),
                style,
            )}
            {...props}
        />
    );
}

export type AlertDialogDescriptionProps = Omit<
    React.ComponentProps<typeof AlertDialogPrimitive.Description>,
    "style"
> & {
    className?: string;
    style?: StyleXStyles;
};

function AlertDialogDescription({ className, style, ...props }: AlertDialogDescriptionProps) {
    const { size } = React.useContext(AlertDialogContentContext);
    const { hasMedia } = React.useContext(AlertDialogHeaderContext);
    return (
        <AlertDialogPrimitive.Description
            data-slot="alert-dialog-description"
            {...stylex.props(
                styles.description,
                typography.sm,
                size === "default" && hasMedia && styles.descriptionWithMediaDefault,
                customClassName(className),
                style,
            )}
            {...props}
        />
    );
}

export type AlertDialogActionProps = React.ComponentProps<typeof Button>;

function AlertDialogAction({ className, ...props }: AlertDialogActionProps) {
    return <Button data-slot="alert-dialog-action" className={className} {...props} />;
}

export type AlertDialogCancelProps = AlertDialogPrimitive.Close.Props &
    Pick<React.ComponentProps<typeof Button>, "variant" | "size">;

function AlertDialogCancel({ className, variant = "outline", size = "default", ...props }: AlertDialogCancelProps) {
    return (
        <AlertDialogPrimitive.Close
            data-slot="alert-dialog-cancel"
            className={className}
            render={<Button variant={variant} size={size} />}
            {...props}
        />
    );
}

export {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger,
};
