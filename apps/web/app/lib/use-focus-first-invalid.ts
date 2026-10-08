"use client";

import { useEffect, useRef } from "react";

import type { FormState } from "./form-state";

/**
 * After a Server Action answers with field errors, moves focus to the form's
 * first invalid field (`aria-invalid`, set by TextField), so keyboard and
 * screen-reader users land on what needs fixing instead of on the button.
 * Runs once per action result (each answer is a new state object). Returns the
 * ref to put on the <form>.
 */
export function useFocusFirstInvalid(state: FormState) {
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state.fieldErrors) return;

        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, [state]);

    return formRef;
}
