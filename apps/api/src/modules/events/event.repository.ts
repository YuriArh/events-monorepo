import { prisma } from "@repo/db";

import type { CreateEventInput, UpdateEventInput } from "./event.types.js";

export const eventRepository = {
  findMany() {
    return prisma.event.findMany({ orderBy: { createdAt: "desc" } });
  },

  findById(id: string) {
    return prisma.event.findUnique({ where: { id } });
  },

  create(data: CreateEventInput) {
    return prisma.event.create({ data });
  },

  update(id: string, data: UpdateEventInput) {
    return prisma.event.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.event.delete({ where: { id } });
  },
};
