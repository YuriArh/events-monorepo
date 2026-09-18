import * as stylex from "@stylexjs/stylex";

/**
 * Design tokens for the StyleX component set.
 *
 * Each token wraps the corresponding CSS custom property defined in the app's
 * global stylesheet (e.g. `--primary`). Theming therefore stays driven by the
 * class-based `.dark` toggle (next-themes) — flipping `.dark` updates the
 * underlying `--*` variables, which propagate through these tokens. Components
 * reference `colors.primary` / `radius.md` instead of stringly-typed
 * `var(--primary)` so token usage is typed and centralized.
 */
export const colors = stylex.defineConsts({
    accent: "var(--accent)",
    accentForeground: "var(--accent-foreground)",
    background: "var(--background)",
    border: "var(--border)",
    card: "var(--card)",
    cardForeground: "var(--card-foreground)",
    destructive: "var(--destructive)",
    foreground: "var(--foreground)",
    input: "var(--input)",
    muted: "var(--muted)",
    mutedForeground: "var(--muted-foreground)",
    popover: "var(--popover)",
    popoverForeground: "var(--popover-foreground)",
    primary: "var(--primary)",
    primaryForeground: "var(--primary-foreground)",
    ring: "var(--ring)",
    secondary: "var(--secondary)",
    secondaryForeground: "var(--secondary-foreground)",
    sidebar: "var(--sidebar)",
    sidebarAccent: "var(--sidebar-accent)",
    sidebarAccentForeground: "var(--sidebar-accent-foreground)",
    sidebarBorder: "var(--sidebar-border)",
    sidebarForeground: "var(--sidebar-foreground)",
    sidebarPrimary: "var(--sidebar-primary)",
    sidebarPrimaryForeground: "var(--sidebar-primary-foreground)",
    sidebarRing: "var(--sidebar-ring)",
    chart1: "var(--chart-1)",
    chart2: "var(--chart-2)",
    chart3: "var(--chart-3)",
    chart4: "var(--chart-4)",
    chart5: "var(--chart-5)",
    textSidebarAccentForeground: "var(--text-sidebar-accent-foreground)",
});

export const radius = stylex.defineConsts({
    xs: "var(--radius-xs, 0.125rem)",
    sm: "var(--radius-sm, 0.25rem)",
    md: "var(--radius-md, 0.375rem)",
    lg: "var(--radius-lg, 0.5rem)",
    xl: "var(--radius-xl, 0.75rem)",
    _2xl: "var(--radius-2xl, 1rem)",
    _3xl: "var(--radius-3xl, 1.5rem)",
    _4xl: "var(--radius-4xl, 2rem)",
    full: "9999px",
});

export const fontSizes = stylex.defineConsts({
    xs: "var(--text-xs, 0.75rem)",
    sm: "var(--text-sm, 0.875rem)",
    base: "var(--text-base, 1rem)",
    lg: "var(--text-lg, 1.125rem)",
    xl: "var(--text-xl, 1.25rem)",
    _2xl: "var(--text-2xl, 1.5rem)",
    _3xl: "var(--text-3xl, 1.875rem)",
    _4xl: "var(--text-4xl, 2.25rem)",
    _5xl: "var(--text-5xl, 3rem)",
    _6xl: "var(--text-6xl, 3.75rem)",
    _7xl: "var(--text-7xl, 4.5rem)",
    _8xl: "var(--text-8xl, 6rem)",
    _9xl: "var(--text-9xl, 8rem)",
});

export const typography = stylex.create({
    xs: {
        fontSize: fontSizes.xs,
        lineHeight: "var(--text-xs--line-height, calc(1 / 0.75))",
    },
    sm: {
        fontSize: fontSizes.sm,
        lineHeight: "var(--text-sm--line-height, calc(1.25 / 0.875))",
    },
    base: {
        fontSize: fontSizes.base,
        lineHeight: "var(--text-base--line-height, calc(1.5 / 1))",
    },
    lg: {
        fontSize: fontSizes.lg,
        lineHeight: "var(--text-lg--line-height, calc(1.75 / 1.125))",
    },
    xl: {
        fontSize: fontSizes.xl,
        lineHeight: "var(--text-xl--line-height, calc(1.75 / 1.25))",
    },
    _2xl: {
        fontSize: fontSizes._2xl,
        lineHeight: "var(--text-2xl--line-height, calc(2 / 1.5))",
    },
    _3xl: {
        fontSize: fontSizes._3xl,
        lineHeight: "var(--text-3xl--line-height, calc(2.25 / 1.875))",
    },
    _4xl: {
        fontSize: fontSizes._4xl,
        lineHeight: "var(--text-4xl--line-height, calc(2.5 / 2.25))",
    },
    _5xl: {
        fontSize: fontSizes._5xl,
        lineHeight: "var(--text-5xl--line-height, 1)",
    },
    _6xl: {
        fontSize: fontSizes._6xl,
        lineHeight: "var(--text-6xl--line-height, 1)",
    },
    _7xl: {
        fontSize: fontSizes._7xl,
        lineHeight: "var(--text-7xl--line-height, 1)",
    },
    _8xl: {
        fontSize: fontSizes._8xl,
        lineHeight: "var(--text-8xl--line-height, 1)",
    },
    _9xl: {
        fontSize: fontSizes._9xl,
        lineHeight: "var(--text-9xl--line-height, 1)",
    },
});
