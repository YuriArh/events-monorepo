"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { DeleteEventDialog } from "@/components/delete-event-dialog";
import { Button, buttonStyleProps } from "@/components/ui/button";
import type { EventRecord } from "@/lib/events";
import { meQuery } from "@/lib/queries";
import { canModifyEvent } from "@/lib/session";

const styles = stylex.create({
    actions: { display: "flex", gap: "0.5rem" },
});

/** Edit/Delete for the organizer or an admin. The API enforces this; hiding is UX. */
export function EventOwnerActions({ event }: { event: Pick<EventRecord, "id" | "name" | "organizerId"> }) {
    const router = useRouter();
    const { data: me } = useQuery(meQuery());
    const [deleting, setDeleting] = useState<Pick<EventRecord, "id" | "name"> | null>(null);

    if (!canModifyEvent(me, event)) return null;

    return (
        <div {...stylex.props(styles.actions)}>
            <Link href={`/events/${event.id}/edit`} {...buttonStyleProps("outline", "sm")}>
                <PencilIcon />
                Edit
            </Link>
            <Button variant="outline" size="sm" onClick={() => setDeleting(event)}>
                <Trash2Icon />
                Delete
            </Button>
            <DeleteEventDialog event={deleting} onClose={() => setDeleting(null)} onDeleted={() => router.push("/")} />
        </div>
    );
}
