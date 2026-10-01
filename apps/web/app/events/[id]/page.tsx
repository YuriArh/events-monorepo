import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as stylex from "@stylexjs/stylex";

import { EventOwnerActions } from "@/components/event-owner-actions";
import { LocalDateTime } from "@/components/local-date-time";
import { formatAddressLines, osmEmbedUrl, osmLinkUrl } from "@/lib/event-detail";
import { imageUrl } from "@/lib/events";
import { getEvent } from "@/lib/events.server";
import { colors, radius, typography } from "@/styles/tokens.stylex";

type Props = { params: Promise<{ id: string }> };

const DESCRIPTION_LIMIT = 160;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const event = await getEvent((await params).id);
    // The page itself also calls notFound() before anything streams, which is
    // what guarantees the HTTP 404 (metadata may stream after the shell).
    if (!event) notFound();

    return {
        title: event.name,
        description: event.description?.slice(0, DESCRIPTION_LIMIT) || undefined,
        openGraph: event.imageKey ? { images: [imageUrl(event.imageKey)] } : undefined,
    };
}

const styles = stylex.create({
    page: {
        minHeight: "100dvh",
        backgroundColor: `color-mix(in oklab, ${colors.muted} 55%, ${colors.background})`,
    },
    main: {
        maxWidth: "48rem",
        marginInline: "auto",
        paddingInline: { default: "1rem", "@media (min-width: 640px)": "1.5rem" },
        paddingBlock: "2.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
    },
    back: { color: colors.mutedForeground, textDecoration: { default: "none", ":hover": "underline" } },
    cover: { width: "100%", maxHeight: "22rem", objectFit: "cover", borderRadius: radius.lg },
    title: { fontSize: "2rem", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.025em" },
    meta: { display: "flex", flexDirection: "column", gap: "0.25rem", color: colors.mutedForeground },
    description: { whiteSpace: "pre-line", lineHeight: 1.6 },
    venue: {
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1.25rem",
        borderRadius: radius.lg,
        backgroundColor: colors.background,
    },
    venueTitle: { fontWeight: 600 },
    address: { fontStyle: "normal", lineHeight: 1.5 },
    map: { width: "100%", height: "18rem", borderWidth: 0, borderRadius: radius.md },
    link: { color: colors.foreground },
});

export default async function EventPage({ params }: Props) {
    const event = await getEvent((await params).id);
    // Awaited at the top of the page, before any Suspense boundary, so the
    // response hasn't started streaming and the status is a real 404.
    if (!event) notFound();

    const address = event.address;

    return (
        <div {...stylex.props(styles.page)}>
            <main {...stylex.props(styles.main)}>
                <Link href="/" {...stylex.props(styles.back, typography.sm)}>
                    <span aria-hidden="true">←</span> All events
                </Link>

                {event.imageKey && (
                    // biome-ignore lint/performance/noImgElement: API-hosted upload, served as a plain <img> like the rest of the app
                    <img src={imageUrl(event.imageKey)} alt="" {...stylex.props(styles.cover)} />
                )}

                <h1 {...stylex.props(styles.title)}>{event.name}</h1>

                <div {...stylex.props(styles.meta, typography.sm)}>
                    {event.startsAt ? (
                        <LocalDateTime startsAt={event.startsAt} endsAt={event.endsAt} />
                    ) : (
                        <span>Date to be announced</span>
                    )}
                    <span>
                        {event.organizer?.name ? `Organized by ${event.organizer.name}` : "Organizer unknown"}
                    </span>
                </div>

                <EventOwnerActions event={{ id: event.id, name: event.name, organizerId: event.organizerId }} />

                {event.description && <p {...stylex.props(styles.description)}>{event.description}</p>}

                {address && (
                    <section aria-labelledby="venue-title" {...stylex.props(styles.venue)}>
                        <h2 id="venue-title" {...stylex.props(styles.venueTitle)}>
                            Venue
                        </h2>
                        <address {...stylex.props(styles.address)}>
                            {formatAddressLines(address).map((line, index) => (
                                // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered lines; index disambiguates duplicates
                                <div key={`${index}-${line}`}>{line}</div>
                            ))}
                        </address>
                        {address.lat !== null && address.lon !== null && (
                            <iframe
                                title={`Map of ${address.label || address.line1}`}
                                src={osmEmbedUrl(address.lat, address.lon)}
                                loading="lazy"
                                {...stylex.props(styles.map)}
                            />
                        )}
                        <a
                            href={osmLinkUrl(address)}
                            target="_blank"
                            rel="noreferrer"
                            {...stylex.props(styles.link, typography.sm)}>
                            Open in OpenStreetMap
                        </a>
                    </section>
                )}
            </main>
        </div>
    );
}
