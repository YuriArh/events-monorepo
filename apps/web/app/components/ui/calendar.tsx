import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { type DayButton, DayPicker, type Locale, getDefaultClassNames } from "react-day-picker";

import { type ButtonVariant, buttonStyles } from "@/components/ui/button";

import { colors, radius, typography } from "@/styles/tokens.stylex";
import { customClassName, dimensions, spacing } from "@/components/ui/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
    buttonVariant?: ButtonVariant;
    className?: string;
    style?: StyleXStyles;
};

function Calendar({
    className,
    style,
    classNames,
    showOutsideDays = true,
    captionLayout = "label",
    buttonVariant = "ghost",
    locale,
    formatters,
    components,
    startMonth = new Date(1900, 0),
    endMonth = new Date(2100, 11),
    ...props
}: CalendarProps) {
    const defaultClassNames = getDefaultClassNames();

    const rootStyleProps = stylex.props(styles.root(), customClassName(className), style as StyleXStyles);
    const monthsStyleProps = stylex.props(styles.months());
    const monthStyleProps = stylex.props(styles.month());
    const navStyleProps = stylex.props(styles.nav());
    const monthCaptionStyleProps = stylex.props(styles.monthCaption());
    const dropdownsStyleProps = stylex.props(styles.dropdowns(), typography.sm);
    const dropdownRootStyleProps = stylex.props(styles.dropdownRoot);
    const dropdownStyleProps = stylex.props(styles.dropdown());
    const captionLabelStyleProps = stylex.props(
        captionLayout === "label" ? styles.captionLabel : styles.captionLabelDropdown(),
        typography.sm,
    );
    const monthGridStyleProps = stylex.props(styles.monthGrid());
    const weekdaysStyleProps = stylex.props(styles.weekdays());
    const weekdayStyleProps = stylex.props(styles.weekday, typography.xs);
    const weekStyleProps = stylex.props(styles.week());
    const weekNumberHeaderStyleProps = stylex.props(styles.weekNumberHeader(), typography.xs);
    const weekNumberStyleProps = stylex.props(styles.weekNumber, typography.xs);
    const dayStyleProps = stylex.props(styles.day());
    const rangeStartStyleProps = stylex.props(styles.rangeStart());
    const rangeMiddleStyleProps = stylex.props(styles.rangeMiddle);
    const rangeEndStyleProps = stylex.props(styles.rangeEnd());
    const todayStyleProps = stylex.props(styles.today);
    const outsideStyleProps = stylex.props(styles.outside);
    const disabledStyleProps = stylex.props(styles.disabled);
    const hiddenStyleProps = stylex.props(styles.hidden);

    const prevBtnProps = stylex.props(buttonStyles.base, buttonStyles[buttonVariant], styles.buttonNav());
    const nextBtnProps = stylex.props(buttonStyles.base, buttonStyles[buttonVariant], styles.buttonNav());

    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={rootStyleProps.className}
            style={rootStyleProps.style}
            styles={{
                root: rootStyleProps.style,
                months: monthsStyleProps.style,
                month: monthStyleProps.style,
                nav: navStyleProps.style,
                month_caption: monthCaptionStyleProps.style,
                dropdowns: dropdownsStyleProps.style,
                dropdown_root: dropdownRootStyleProps.style,
                dropdown: dropdownStyleProps.style,
                caption_label: captionLabelStyleProps.style,
                month_grid: monthGridStyleProps.style,
                weekdays: weekdaysStyleProps.style,
                weekday: weekdayStyleProps.style,
                week: weekStyleProps.style,
                week_number_header: weekNumberHeaderStyleProps.style,
                week_number: weekNumberStyleProps.style,
                day: dayStyleProps.style,
                range_start: rangeStartStyleProps.style,
                range_middle: rangeMiddleStyleProps.style,
                range_end: rangeEndStyleProps.style,
                today: todayStyleProps.style,
                outside: outsideStyleProps.style,
                disabled: disabledStyleProps.style,
                hidden: hiddenStyleProps.style,
                ...props.styles,
            }}
            captionLayout={captionLayout}
            locale={locale}
            startMonth={startMonth}
            endMonth={endMonth}
            formatters={{
                formatMonthDropdown: (date) => date.toLocaleString(locale?.code, { month: "short" }),
                ...formatters,
            }}
            classNames={{
                root: [rootStyleProps.className, defaultClassNames.root].filter(Boolean).join(" "),
                months: [monthsStyleProps.className, defaultClassNames.months].filter(Boolean).join(" "),
                month: [monthStyleProps.className, defaultClassNames.month].filter(Boolean).join(" "),
                nav: [navStyleProps.className, defaultClassNames.nav].filter(Boolean).join(" "),
                button_previous: [prevBtnProps.className, defaultClassNames.button_previous].filter(Boolean).join(" "),
                button_next: [nextBtnProps.className, defaultClassNames.button_next].filter(Boolean).join(" "),
                month_caption: [monthCaptionStyleProps.className, defaultClassNames.month_caption]
                    .filter(Boolean)
                    .join(" "),
                dropdowns: [dropdownsStyleProps.className, defaultClassNames.dropdowns].filter(Boolean).join(" "),
                dropdown_root: [dropdownRootStyleProps.className, defaultClassNames.dropdown_root]
                    .filter(Boolean)
                    .join(" "),
                dropdown: [dropdownStyleProps.className, defaultClassNames.dropdown].filter(Boolean).join(" "),
                caption_label: [captionLabelStyleProps.className, defaultClassNames.caption_label]
                    .filter(Boolean)
                    .join(" "),
                month_grid: [monthGridStyleProps.className, defaultClassNames.month_grid].filter(Boolean).join(" "),
                weekdays: [weekdaysStyleProps.className, defaultClassNames.weekdays].filter(Boolean).join(" "),
                weekday: [weekdayStyleProps.className, defaultClassNames.weekday].filter(Boolean).join(" "),
                week: [weekStyleProps.className, defaultClassNames.week].filter(Boolean).join(" "),
                week_number_header: [weekNumberHeaderStyleProps.className, defaultClassNames.week_number_header]
                    .filter(Boolean)
                    .join(" "),
                week_number: [weekNumberStyleProps.className, defaultClassNames.week_number].filter(Boolean).join(" "),
                day: [dayStyleProps.className, defaultClassNames.day].filter(Boolean).join(" "),
                range_start: [rangeStartStyleProps.className, defaultClassNames.range_start].filter(Boolean).join(" "),
                range_middle: [rangeMiddleStyleProps.className, defaultClassNames.range_middle]
                    .filter(Boolean)
                    .join(" "),
                range_end: [rangeEndStyleProps.className, defaultClassNames.range_end].filter(Boolean).join(" "),
                today: [todayStyleProps.className, defaultClassNames.today].filter(Boolean).join(" "),
                outside: [outsideStyleProps.className, defaultClassNames.outside].filter(Boolean).join(" "),
                disabled: [disabledStyleProps.className, defaultClassNames.disabled].filter(Boolean).join(" "),
                hidden: [hiddenStyleProps.className, defaultClassNames.hidden].filter(Boolean).join(" "),
                ...classNames,
            }}
            components={{
                Root: ({ className: rootCn, rootRef, ...rootProps }) => {
                    return <div data-slot="calendar" ref={rootRef} className={rootCn} {...rootProps} />;
                },
                Chevron: ({ className: iconCn, orientation, ...chevronProps }) => {
                    const chevronStyleProps = stylex.props(styles.chevron(), customClassName(iconCn));
                    if (orientation === "left") {
                        return <ChevronLeftIcon {...chevronStyleProps} {...chevronProps} />;
                    }

                    if (orientation === "right") {
                        return <ChevronRightIcon {...chevronStyleProps} {...chevronProps} />;
                    }

                    return <ChevronDownIcon {...chevronStyleProps} {...chevronProps} />;
                },
                DayButton: ({ style: _dayBtnStyle, ...dayButtonProps }) => (
                    <CalendarDayButton locale={locale} {...dayButtonProps} />
                ),
                WeekNumber: ({ children, ...weekNumProps }) => {
                    return (
                        <td {...weekNumProps}>
                            <div {...stylex.props(styles.weekNumberCell())}>{children}</div>
                        </td>
                    );
                },
                ...components,
            }}
            {...props}
        />
    );
}

export type CalendarDayButtonProps = Omit<React.ComponentProps<typeof DayButton>, "style"> & {
    locale?: Partial<Locale>;
    className?: string;
    style?: StyleXStyles;
};

function CalendarDayButton({ className, style, day, modifiers, locale, ...props }: CalendarDayButtonProps) {
    const defaultClassNames = getDefaultClassNames();
    const ref = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => {
        if (modifiers.focused) ref.current?.focus();
    }, [modifiers.focused]);

    const isSelectedSingle =
        modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle;

    const dayBtnStyleProps = stylex.props(
        styles.dayBtnBase(),
        typography.sm,
        modifiers.focused && styles.dayBtnFocused,
        isSelectedSingle && styles.dayBtnSelected,
        modifiers.range_start && styles.dayBtnRangeStart,
        modifiers.range_end && styles.dayBtnRangeEnd,
        modifiers.range_middle && styles.dayBtnRangeMiddle,
        customClassName(className),
        style,
    );

    return (
        <button
            ref={ref}
            type="button"
            data-slot="button"
            data-day={day.date.toLocaleDateString(locale?.code)}
            data-selected-single={isSelectedSingle}
            data-range-start={modifiers.range_start}
            data-range-end={modifiers.range_end}
            data-range-middle={modifiers.range_middle}
            className={[dayBtnStyleProps.className, defaultClassNames.day].filter(Boolean).join(" ")}
            style={{ border: "none", ...dayBtnStyleProps.style }}
            {...props}
        />
    );
}

const styles = stylex.create({
    root: () => ({
        backgroundColor: colors.background,
        padding: spacing(2),
        position: "relative",
        width: dimensions.percent(100),
    }),
    months: () => ({
        position: "relative",
        display: "flex",
        width: dimensions.percent(100),
        flexDirection: {
            default: "column",
            "@media (min-width: 768px)": "row",
        },
        gap: spacing(4),
    }),
    month: () => ({
        display: "flex",
        width: dimensions.percent(100),
        flexDirection: "column",
        gap: spacing(4),
    }),
    nav: () => ({
        position: "absolute",
        top: 0,
        insetInline: 0,
        display: "flex",
        width: dimensions.percent(100),
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing(1),
        zIndex: 1,
    }),
    buttonNav: () => ({
        height: dimensions.rem(1.75),
        width: dimensions.rem(1.75),
        padding: 0,
        userSelect: "none",
        opacity: {
            default: 1,
            ":disabled": 0.5,
        },
    }),
    monthCaption: () => ({
        display: "flex",
        height: dimensions.rem(1.75),
        width: dimensions.percent(100),
        alignItems: "center",
        justifyContent: "center",
        paddingInline: 0,
    }),
    dropdowns: () => ({
        display: "flex",
        height: dimensions.rem(1.75),
        width: dimensions.percent(100),
        alignItems: "center",
        justifyContent: "center",
        gap: spacing(1.5),
        fontWeight: 500,
    }),
    dropdownRoot: {
        position: "relative",
        borderRadius: radius.md,
        display: "inline-flex",
        alignItems: "center",
    },
    dropdown: () => ({
        position: "absolute",
        inset: 0,
        width: dimensions.percent(100),
        height: dimensions.percent(100),
        opacity: 0,
        cursor: "pointer",
        zIndex: 10,
    }),
    captionLabel: {
        fontWeight: 500,
        userSelect: "none",
    },
    captionLabelDropdown: () => ({
        display: "flex",
        alignItems: "center",
        gap: spacing(1),
        borderRadius: radius.md,
        fontWeight: 500,
        userSelect: "none",
        pointerEvents: "none",
    }),
    monthGrid: () => ({
        width: dimensions.percent(100),
        borderCollapse: "collapse",
    }),
    weekdays: () => ({
        display: "flex",
        width: dimensions.percent(100),
    }),
    weekday: {
        flex: 1,
        borderRadius: radius.md,
        fontWeight: 400,
        color: colors.mutedForeground,
        userSelect: "none",
        textAlign: "center",
    },
    week: () => ({
        marginTop: spacing(2),
        display: "flex",
        width: dimensions.percent(100),
    }),
    weekNumberHeader: () => ({
        width: dimensions.rem(1.75),
        userSelect: "none",
    }),
    weekNumber: {
        color: colors.mutedForeground,
        userSelect: "none",
    },
    weekNumberCell: () => ({
        display: "flex",
        height: dimensions.rem(1.75),
        width: dimensions.rem(1.75),
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
    }),
    day: () => ({
        position: "relative",
        aspectRatio: "1 / 1",
        height: dimensions.percent(100),
        width: dimensions.percent(100),
        borderRadius: radius.md,
        padding: 0,
        textAlign: "center",
        userSelect: "none",
    }),
    rangeStart: () => ({
        position: "relative",
        isolation: "isolate",
        zIndex: 0,
        borderTopLeftRadius: radius.md,
        borderBottomLeftRadius: radius.md,
        backgroundColor: colors.muted,
        "::after": {
            content: '""',
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: dimensions.rem(1),
            backgroundColor: colors.muted,
        },
    }),
    rangeMiddle: {
        borderRadius: 0,
    },
    rangeEnd: () => ({
        position: "relative",
        isolation: "isolate",
        zIndex: 0,
        borderTopRightRadius: radius.md,
        borderBottomRightRadius: radius.md,
        backgroundColor: colors.muted,
        "::after": {
            content: '""',
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: dimensions.rem(1),
            backgroundColor: colors.muted,
        },
    }),
    today: {
        borderRadius: radius.md,
        backgroundColor: colors.muted,
        color: colors.foreground,
    },
    outside: {
        color: colors.mutedForeground,
    },
    disabled: {
        color: colors.mutedForeground,
        opacity: 0.5,
    },
    hidden: {
        visibility: "hidden",
    },
    chevron: () => ({
        height: dimensions.rem(1),
        width: dimensions.rem(1),
        ":dir(rtl)": {
            transform: "scaleX(-1)",
        },
    }),
    dayBtnBase: () => ({
        position: "relative",
        isolation: "isolate",
        zIndex: 10,
        display: "flex",
        aspectRatio: "1 / 1",
        height: dimensions.percent(100),
        width: dimensions.percent(100),
        minWidth: dimensions.rem(1.75),
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing(1),
        borderWidth: 0,
        borderStyle: "none",
        borderColor: "transparent",
        backgroundColor: {
            default: "transparent",
            ":hover": colors.muted,
        },
        fontWeight: 400,
        borderRadius: radius.md,
        color: {
            default: colors.foreground,
            ":hover": colors.foreground,
        },
    }),
    dayBtnFocused: {
        position: "relative",
        zIndex: 10,
        boxShadow: `0 0 0 3px color-mix(in oklab, ${colors.ring} 50%, transparent)`,
    },
    dayBtnSelected: {
        borderRadius: radius.md,
        backgroundColor: {
            default: colors.primary,
            ":hover": colors.primary,
        },
        color: {
            default: colors.primaryForeground,
            ":hover": colors.primaryForeground,
        },
    },
    dayBtnRangeStart: {
        borderTopLeftRadius: radius.md,
        borderBottomLeftRadius: radius.md,
        backgroundColor: {
            default: colors.primary,
            ":hover": colors.primary,
        },
        color: {
            default: colors.primaryForeground,
            ":hover": colors.primaryForeground,
        },
    },
    dayBtnRangeEnd: {
        borderTopRightRadius: radius.md,
        borderBottomRightRadius: radius.md,
        backgroundColor: {
            default: colors.primary,
            ":hover": colors.primary,
        },
        color: {
            default: colors.primaryForeground,
            ":hover": colors.primaryForeground,
        },
    },
    dayBtnRangeMiddle: {
        borderRadius: 0,
        backgroundColor: {
            default: colors.muted,
            ":hover": colors.muted,
        },
        color: {
            default: colors.foreground,
            ":hover": colors.foreground,
        },
    },
});

export { Calendar, CalendarDayButton, styles as calendarStyles };
