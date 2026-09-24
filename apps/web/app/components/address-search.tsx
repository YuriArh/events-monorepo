"use client";

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";

import {
    emptyStateMessage,
    geocodeApi,
    geocodeKeys,
    MIN_QUERY_LENGTH,
    type AddressSelection,
    type GeocodeState,
    type GeocodeSuggestion,
} from "@/lib/geocode";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { colors, radius, typography } from "@/styles/tokens.stylex";

const styles = stylex.create({
    inputRow: { position: "relative", display: "flex", alignItems: "center" },
    clear: {
        position: "absolute",
        insetInlineEnd: "0.5rem",
        display: "flex",
        alignItems: "center",
        borderStyle: "none",
        backgroundColor: "transparent",
        color: colors.mutedForeground,
        cursor: "pointer",
    },
    input: {
        width: "100%",
        borderRadius: radius.md,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: colors.border,
        backgroundColor: colors.background,
        color: colors.foreground,
        paddingInline: "0.75rem",
        paddingBlock: "0.5rem",
    },
    popup: {
        borderRadius: radius.md,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: colors.border,
        backgroundColor: colors.background,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12)",
        paddingBlock: "0.25rem",
        maxHeight: "18rem",
        overflowY: "auto",
        width: "var(--anchor-width)",
    },
    item: {
        cursor: "default",
        paddingInline: "0.75rem",
        paddingBlock: "0.5rem",
        backgroundColor: { default: "transparent", ":hover": colors.muted },
    },
    message: {
        color: colors.mutedForeground,
        paddingInline: "0.75rem",
        paddingBlock: "0.5rem",
    },
});

export type AddressSearchProps = {
    id: string;
    value: AddressSelection | null;
    onChange: (value: GeocodeSuggestion | null) => void;
};

export function AddressSearch({ id, value, onChange }: AddressSearchProps) {
    const [query, setQuery] = useState(value?.display ?? "");
    const debounced = useDebouncedValue(query.trim(), 300);

    const enabled = debounced.length >= MIN_QUERY_LENGTH;

    const { data, isFetching, isError } = useQuery({
        queryKey: geocodeKeys.search(debounced),
        queryFn: () => geocodeApi.search(debounced),
        enabled,
        // Addresses do not move; refetching on focus would only spend upstream
        // calls Photon asks us to be sparing with.
        staleTime: 60 * 60 * 1000,
        retry: false,
    });

    const state: GeocodeState = !enabled
        ? { status: "idle" }
        : isError
          ? { status: "error" }
          : isFetching && !data
            ? { status: "loading" }
            : data
              ? { status: "ready", suggestionCount: data.suggestions.length, filtered: data.filtered }
              : { status: "loading" };

    const message = emptyStateMessage(state);
    const items = data?.suggestions ?? [];

    return (
        <Autocomplete.Root
            items={items}
            // Filtering happens server-side; the built-in filter would hide
            // valid results by re-filtering them against the raw input.
            filter={null}
            value={query}
            onValueChange={(next: string) => {
                setQuery(next);

                // Editing the text abandons the previous selection: what is in
                // the box must always be what would be saved.
                if (value && next !== value.display) {
                    onChange(null);
                }
            }}
            onItemHighlighted={() => undefined}>
            <div {...stylex.props(styles.inputRow)}>
                <Autocomplete.Input
                    id={id}
                    placeholder="Search for an address"
                    {...stylex.props(styles.input)}
                />

                {/* The spec requires a selection be clearable without deleting
                    the text by hand. Rendered only when there is something to
                    clear, so it never reads as a disabled control. */}
                {(value || query !== "") && (
                    <Autocomplete.Clear
                        aria-label="Clear address"
                        onClick={() => {
                            onChange(null);
                            setQuery("");
                        }}
                        {...stylex.props(styles.clear)}>
                        <XIcon size={16} />
                    </Autocomplete.Clear>
                )}
            </div>

            <Autocomplete.Portal>
                <Autocomplete.Positioner sideOffset={4}>
                    <Autocomplete.Popup {...stylex.props(styles.popup, typography.sm)}>
                        <Autocomplete.List>
                            {(item: GeocodeSuggestion) => (
                                <Autocomplete.Item
                                    key={item.osmId}
                                    value={item}
                                    onClick={() => {
                                        onChange(item);
                                        setQuery(item.display);
                                    }}
                                    {...stylex.props(styles.item)}>
                                    {item.display}
                                </Autocomplete.Item>
                            )}
                        </Autocomplete.List>

                        {/* Must stay mounted: Base UI announces changes through
                            this element, so only its children are conditional. */}
                        <Autocomplete.Empty {...stylex.props(styles.message)}>
                            {message}
                        </Autocomplete.Empty>
                    </Autocomplete.Popup>
                </Autocomplete.Positioner>
            </Autocomplete.Portal>
        </Autocomplete.Root>
    );
}
