"use client";

import * as stylex from "@stylexjs/stylex";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toTimeInput, withDate, withTime } from "@/lib/date-time";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
    row: { display: "flex", gap: "0.5rem" },
    trigger: { flex: 1, justifyContent: "flex-start", gap: "0.5rem" },
    placeholder: { color: colors.mutedForeground },
    time: { width: "8rem" },
    content: { padding: "0.5rem" },
});

const formatDay = (value: Date) =>
    value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export type DateTimePickerProps = {
    id: string;
    label: string;
    value: Date | null;
    onChange: (value: Date | null) => void;
};

export function DateTimePicker({ id, label, value, onChange }: DateTimePickerProps) {
    return (
        <div {...stylex.props(styles.row)}>
            <Popover>
                <PopoverTrigger
                    render={
                        <Button id={id} type="button" variant="outline" style={styles.trigger}>
                            <CalendarIcon size={16} />
                            {value ? (
                                formatDay(value)
                            ) : (
                                <span {...stylex.props(styles.placeholder)}>Pick a date</span>
                            )}
                        </Button>
                    }
                />
                <PopoverContent style={styles.content}>
                    <Calendar
                        mode="single"
                        selected={value ?? undefined}
                        onSelect={(day) => onChange(withDate(value, day ?? null))}
                    />
                </PopoverContent>
            </Popover>

            <Input
                type="time"
                aria-label={`${label} time`}
                style={styles.time}
                value={toTimeInput(value)}
                disabled={!value}
                onChange={(event) => onChange(withTime(value, event.target.value))}
            />
        </div>
    );
}
