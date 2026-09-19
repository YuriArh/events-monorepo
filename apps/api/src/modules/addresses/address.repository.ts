import { prisma } from "@repo/db";

import type { CreateAddressInput, UpdateAddressInput } from "./address.types.js";

export const addressRepository = {
  findMany() {
    return prisma.address.findMany({ orderBy: [{ city: "asc" }, { line1: "asc" }] });
  },

  findById(id: string) {
    return prisma.address.findUnique({ where: { id } });
  },

  create(data: CreateAddressInput) {
    return prisma.address.create({ data });
  },

  update(id: string, data: UpdateAddressInput) {
    return prisma.address.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.address.delete({ where: { id } });
  },
};
