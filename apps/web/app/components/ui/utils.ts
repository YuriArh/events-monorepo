import type { StyleXStyles } from "@stylexjs/stylex";

export const customClassName = (className: string | undefined) =>
    className ? ({ [className]: className, $$css: true } as StyleXStyles) : null;

/** Only for use inside dynamic style functions (runtime-only values).
 *  For anything known when you write the code, use the `spacing` consts
 *  from tokens.stylex.ts instead — it's free at runtime, this isn't. */
export const spacing = (multiplier: number): string => `calc(var(--spacing, 0.25rem) * ${multiplier})`;

export const dimensions = {
    rem: (value: number): string => `${value}rem`,
    percent: (value: number): string => `${value}%`,
    viewHeight: (value: number): string => `${value}vh`,
};
