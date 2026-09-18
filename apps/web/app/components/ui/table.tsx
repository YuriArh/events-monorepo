import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { colors, typography } from "@/styles/tokens.stylex";
import { customClassName, dimensions } from "@/components/ui/utils";

const styles = stylex.create({
    container: () => ({
        position: "relative",
        width: dimensions.percent(100),
        overflowX: "auto",
    }),
    table: () => ({
        width: dimensions.percent(100),
        captionSide: "bottom",
    }),
    header: {
        borderBottomWidth: {
            default: null,
            ":nth-child(n) > tr": "1px",
        },
        borderBottomStyle: {
            default: null,
            ":nth-child(n) > tr": "solid",
        },
        borderBottomColor: {
            default: null,
            ":nth-child(n) > tr": colors.border,
        },
    },
    body: {
        borderBottomWidth: {
            default: null,
            ":nth-child(n) > tr:last-child": 0,
        },
    },
    footer: {
        borderTopWidth: "1px",
        borderTopStyle: "solid",
        borderTopColor: colors.border,
        backgroundColor: `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
        fontWeight: 500,
        borderBottomWidth: {
            default: null,
            ":nth-child(n) > tr:last-child": 0,
        },
    },
    row: {
        borderBottomWidth: "1px",
        borderBottomStyle: "solid",
        borderBottomColor: colors.border,
        transitionProperty: "color, background-color, border-color",
        transitionDuration: "150ms",
        backgroundColor: {
            default: "transparent",
            ":hover": `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
            ":has([aria-expanded=true])": `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
            ":nth-child(n)[data-state=selected]": colors.muted,
        },
    },
    head: () => ({
        height: dimensions.rem(2.5),
        paddingInline: "0.5rem",
        textAlign: "left",
        verticalAlign: "middle",
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: colors.foreground,
        paddingRight: {
            default: null,
            ":has([role=checkbox])": 0,
        },
    }),
    cell: {
        padding: "0.5rem",
        verticalAlign: "middle",
        whiteSpace: "nowrap",
        paddingRight: {
            default: null,
            ":has([role=checkbox])": 0,
        },
    },
    caption: {
        marginTop: "1rem",
        color: colors.mutedForeground,
    },
});

export type TableProps = Omit<React.ComponentProps<"table">, "style"> & {
    className?: string;
    style?: StyleXStyles;
    containerStyle?: StyleXStyles;
};

function Table({ className, style, containerStyle, ...props }: TableProps) {
    return (
        <div data-slot="table-container" {...stylex.props(styles.container(), containerStyle)}>
            <table
                data-slot="table"
                {...stylex.props(styles.table(), typography.sm, customClassName(className), style as StyleXStyles)}
                {...props}
            />
        </div>
    );
}

export type TableHeaderProps = Omit<React.ComponentProps<"thead">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function TableHeader({ className, style, ...props }: TableHeaderProps) {
    return (
        <thead
            data-slot="table-header"
            {...stylex.props(styles.header, customClassName(className), style as StyleXStyles)}
            {...props}
        />
    );
}

export type TableBodyProps = Omit<React.ComponentProps<"tbody">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function TableBody({ className, style, ...props }: TableBodyProps) {
    return (
        <tbody
            data-slot="table-body"
            {...stylex.props(styles.body, customClassName(className), style as StyleXStyles)}
            {...props}
        />
    );
}

export type TableFooterProps = Omit<React.ComponentProps<"tfoot">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function TableFooter({ className, style, ...props }: TableFooterProps) {
    return (
        <tfoot
            data-slot="table-footer"
            {...stylex.props(styles.footer, customClassName(className), style as StyleXStyles)}
            {...props}
        />
    );
}

export type TableRowProps = Omit<React.ComponentProps<"tr">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function TableRow({ className, style, ...props }: TableRowProps) {
    return (
        <tr
            data-slot="table-row"
            {...stylex.props(styles.row, customClassName(className), style as StyleXStyles)}
            {...props}
        />
    );
}

export type TableHeadProps = Omit<React.ComponentProps<"th">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function TableHead({ className, style, ...props }: TableHeadProps) {
    return (
        <th
            data-slot="table-head"
            {...stylex.props(styles.head(), customClassName(className), style as StyleXStyles)}
            {...props}
        />
    );
}

export type TableCellProps = Omit<React.ComponentProps<"td">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function TableCell({ className, style, ...props }: TableCellProps) {
    return (
        <td
            data-slot="table-cell"
            {...stylex.props(styles.cell, customClassName(className), style as StyleXStyles)}
            {...props}
        />
    );
}

export type TableCaptionProps = Omit<React.ComponentProps<"caption">, "style"> & {
    className?: string;
    style?: StyleXStyles;
};

function TableCaption({ className, style, ...props }: TableCaptionProps) {
    return (
        <caption
            data-slot="table-caption"
            {...stylex.props(styles.caption, typography.sm, customClassName(className), style as StyleXStyles)}
            {...props}
        />
    );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
