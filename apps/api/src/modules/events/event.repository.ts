import { prisma } from "@repo/db";

import type { CreateEventInput, UpdateEventInput } from "./event.types.js";

export const eventRepository = {
  findMany() {
    return prisma.event.findMany({
      orderBy: { startsAt: "asc" },
      include: { address: true },
    });
  },

  findById(id: string) {
    return prisma.event.findUnique({ where: { id }, include: { address: true } });
  },

  findByAddressId(addressId: string) {
    return prisma.event.findUnique({ where: { addressId } });
  },

  create(data: CreateEventInput) {
    return prisma.event.create({ data, include: { address: true } });
  },

  update(id: string, data: UpdateEventInput) {
    return prisma.event.update({ where: { id }, data, include: { address: true } });
  },

  delete(id: string) {
    return prisma.event.delete({ where: { id } });
  },
};
