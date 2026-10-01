import { Prisma, prisma } from "@repo/db";

import type { CreateAddressInput, CreateEventInput, UpdateEventInput } from "./event.types.js";

/**
 * What every event response carries: the venue, and the organizer's public
 * fields only — never their email.
 */
const withRelations = {
  address: true,
  organizer: { select: { id: true, name: true } },
} as const;

/**
 * Prisma cannot tell "SQL NULL" from "the JSON value null" on a nullable Json
 * column, so it refuses a bare `null` and wants `Prisma.DbNull` instead.
 */
const toAddressData = (address: CreateAddressInput) => ({
  // Every optional column is written, so an update replaces the whole venue
  // instead of leaving stale values from the previous one.
  label: address.label ?? null,
  line1: address.line1,
  line2: address.line2 ?? null,
  city: address.city,
  region: address.region ?? null,
  postalCode: address.postalCode ?? null,
  country: address.country,
  lat: address.lat ?? null,
  lon: address.lon ?? null,
  osmId: address.osmId ?? null,
  raw:
    address.raw === undefined || address.raw === null
      ? Prisma.DbNull
      : (address.raw as Prisma.InputJsonValue),
});

/**
 * The venue is part of the event: `undefined` leaves it alone, `null` deletes
 * the row, an object creates it or updates the existing one in place.
 */
const venueWrite = (address: CreateAddressInput | null | undefined, hasVenue: boolean) => {
  if (address === undefined) return undefined;
  if (address === null) return hasVenue ? { delete: true } : undefined;

  const data = toAddressData(address);
  return { upsert: { create: data, update: data } };
};

export const eventRepository = {
  findMany() {
    return prisma.event.findMany({ orderBy: { startsAt: "asc" }, include: withRelations });
  },

  findById(id: string) {
    return prisma.event.findUnique({ where: { id }, include: withRelations });
  },

  findByImageKey(imageKey: string) {
    return prisma.event.findFirst({ where: { imageKey }, select: { id: true } });
  },

  /** organizerId comes from the session, never from the request body. */
  create({ address, ...data }: CreateEventInput, organizerId: string) {
    return prisma.event.create({
      data: {
        ...data,
        organizer: { connect: { id: organizerId } },
        address: address ? { create: toAddressData(address) } : undefined,
      },
      include: withRelations,
    });
  },

  update(id: string, { address, ...data }: UpdateEventInput, hasVenue: boolean) {
    return prisma.event.update({
      where: { id },
      data: { ...data, address: venueWrite(address, hasVenue) },
      include: withRelations,
    });
  },

  /** The venue belongs to the event, so it goes with it. */
  delete(id: string, addressId: string | null) {
    return prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id } });

      if (addressId) {
        await tx.address.delete({ where: { id: addressId } });
      }
    });
  },
};
