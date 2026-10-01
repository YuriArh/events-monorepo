"use client";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type EventRecord, eventKeys, eventsApi } from "@/lib/events";
import { colors, typography } from "@/styles/tokens.stylex";

const spin = stylex.keyframes({
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
    destructiveAction: {
        backgroundColor: {
            default: colors.destructive,
            ":hover": `color-mix(in oklab, ${colors.destructive} 90%, transparent)`,
        },
        color: "#fff",
    },
    spinner: {
        animationName: spin,
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
    error: { color: colors.destructive },
});

/** The one confirmation dialog for deleting an event, used by the list and the detail page. */
export function DeleteEventDialog({
    event,
    onClose,
    onDeleted,
}: {
    event: EventRecord | null;
    onClose: () => void;
    onDeleted?: () => void;
}) {
    const queryClient = useQueryClient();
    const remove = useMutation({
        mutationFn: (id: string) => eventsApi.remove(id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: eventKeys.all });
            onClose();
            onDeleted?.();
        },
    });

    return (
        <AlertDialog
            open={event !== null}
            onOpenChange={(open) => {
                if (!open) {
                    remove.reset();
                    onClose();
                }
            }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{event?.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                {remove.error && (
                    <p role="alert" {...stylex.props(styles.error, typography.sm)}>
                        {remove.error.message}
                    </p>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        style={styles.destructiveAction}
                        disabled={remove.isPending}
                        onClick={() => event && remove.mutate(event.id)}>
                        {remove.isPending && <Loader2Icon {...stylex.props(styles.spinner)} />}
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
