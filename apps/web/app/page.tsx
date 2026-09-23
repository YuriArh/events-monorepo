"use client";

import { useState } from "react";
import Link from "next/link";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { colors, radius, typography } from "@/styles/tokens.stylex";
import { type EventRecord, eventKeys, eventsApi } from "@/lib/events";

const spin = stylex.keyframes({
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: {
            default: "1rem",
            "@media (min-width: 640px)": "1.5rem",
        },
        paddingBlock: "3.5rem",
    },
    header: {
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: "1rem",
        marginBottom: "1.75rem",
    },
    title: {
        fontSize: "1.875rem",
        lineHeight: 1.2,
        fontWeight: 600,
        letterSpacing: "-0.025em",
    },
    subtitle: {
        marginTop: "0.375rem",
        color: colors.mutedForeground,
    },
    errorBanner: {
        marginBottom: "1.5rem",
        borderRadius: radius.lg,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: `color-mix(in oklab, ${colors.destructive} 30%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${colors.destructive} 10%, transparent)`,
        color: colors.destructive,
        paddingInline: "1rem",
        paddingBlock: "0.75rem",
    },
    card: {
        borderRadius: radius.xl,
    },
    cardContent: {
        paddingInline: 0,
    },
    stateBox: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        paddingBlock: "5rem",
        color: colors.mutedForeground,
    },
    emptyBox: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        paddingBlock: "5rem",
        paddingInline: "1.5rem",
        textAlign: "center",
    },
    emptyIcon: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "3rem",
        height: "3rem",
        borderRadius: radius.full,
        backgroundColor: colors.muted,
        color: colors.mutedForeground,
    },
    emptyTitle: {
        fontWeight: 500,
    },
    emptyText: {
        color: colors.mutedForeground,
    },
    headRow: {
        backgroundColor: `color-mix(in oklab, ${colors.muted} 50%, transparent)`,
    },
    headCell: {
        height: "2.75rem",
        paddingInline: "1.25rem",
        color: colors.mutedForeground,
        fontSize: "0.75rem",
        fontWeight: 500,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
    },
    headCellRight: {
        textAlign: "right",
    },
    cell: {
        paddingInline: "1.25rem",
        paddingBlock: "0.875rem",
    },
    nameWrap: {
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
    },
    iconChip: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: "2rem",
        height: "2rem",
        borderRadius: radius.lg,
        backgroundColor: colors.muted,
        color: colors.mutedForeground,
    },
    nameText: {
        fontWeight: 500,
    },
    mutedCell: {
        color: colors.mutedForeground,
    },
    actions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "0.25rem",
    },
    deleteButton: {
        color: {
            default: null,
            ":hover": colors.destructive,
        },
    },
    destructiveAction: {
        backgroundColor: {
            default: colors.destructive,
            ":hover": `color-mix(in oklab, ${colors.destructive} 90%, transparent)`,
        },
        color: "#fff",
    },
    field: {
        display: "grid",
        gap: "0.5rem",
        paddingBlock: "1rem",
    },
    fieldError: {
        color: colors.destructive,
    },
    spinner: {
        animationName: spin,
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
});

const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export default function HomePage() {
    const queryClient = useQueryClient();

    const [deletingEvent, setDeletingEvent] = useState<EventRecord | null>(null);

    const {
        data: events = [],
        isPending,
        error: listError,
    } = useQuery({
        queryKey: eventKeys.all,
        queryFn: eventsApi.list,
    });

    const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: eventKeys.all });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => eventsApi.remove(id),
        onSuccess: async () => {
            await invalidateEvents();
            setDeletingEvent(null);
        },
    });

    const handleDelete = () => {
        if (deletingEvent) {
            deleteMutation.mutate(deletingEvent.id);
        }
    };

    const pageError = listError
        ? messageOf(listError, "Failed to load events")
        : deleteMutation.error
          ? messageOf(deleteMutation.error, "Failed to delete event")
          : null;

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <div {...stylex.props(styles.header)}>
                    <div>
                        <h1 {...stylex.props(styles.title)}>Events</h1>
                        <p {...stylex.props(styles.subtitle, typography.sm)}>
                            {events.length > 0
                                ? `${events.length} event${events.length === 1 ? "" : "s"} on the calendar`
                                : "Create and manage your events"}
                        </p>
                    </div>
                    <Button render={<Link href="/events/new" />}>
                        <PlusIcon />
                        New Event
                    </Button>
                </div>

                {pageError && <div {...stylex.props(styles.errorBanner, typography.sm)}>{pageError}</div>}

                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        {isPending ? (
                            <div {...stylex.props(styles.stateBox, typography.sm)}>
                                <Loader2Icon {...stylex.props(styles.spinner)} size={16} />
                                Loading events…
                            </div>
                        ) : events.length === 0 ? (
                            <div {...stylex.props(styles.emptyBox)}>
                                <div {...stylex.props(styles.emptyIcon)}>
                                    <CalendarIcon size={22} />
                                </div>
                                <div>
                                    <p {...stylex.props(styles.emptyTitle)}>No events yet</p>
                                    <p {...stylex.props(styles.emptyText, typography.sm)}>
                                        Get started by creating your first event.
                                    </p>
                                </div>
                                <Button variant="outline" render={<Link href="/events/new" />}>
                                    <PlusIcon />
                                    New Event
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow style={styles.headRow}>
                                        <TableHead style={styles.headCell}>Event</TableHead>
                                        <TableHead style={styles.headCell}>Created</TableHead>
                                        <TableHead style={[styles.headCell, styles.headCellRight]}>
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {events.map((event) => (
                                        <TableRow key={event.id}>
                                            <TableCell style={styles.cell}>
                                                <div {...stylex.props(styles.nameWrap)}>
                                                    <span {...stylex.props(styles.iconChip)}>
                                                        <CalendarIcon size={15} />
                                                    </span>
                                                    <span {...stylex.props(styles.nameText)}>{event.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell style={[styles.cell, styles.mutedCell, typography.sm]}>
                                                {formatDate(event.createdAt)}
                                            </TableCell>
                                            <TableCell style={styles.cell}>
                                                <div {...stylex.props(styles.actions)}>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        aria-label={`Edit ${event.name}`}
                                                        render={<Link href={`/events/${event.id}/edit`} />}>
                                                        <PencilIcon />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        aria-label={`Delete ${event.name}`}
                                                        style={styles.deleteButton}
                                                        onClick={() => setDeletingEvent(event)}>
                                                        <Trash2Icon />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </main>

            <AlertDialog open={deletingEvent !== null} onOpenChange={(open) => !open && setDeletingEvent(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{deletingEvent?.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            style={styles.destructiveAction}
                            disabled={deleteMutation.isPending}
                            onClick={handleDelete}>
                            {deleteMutation.isPending && <Loader2Icon {...stylex.props(styles.spinner)} />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
