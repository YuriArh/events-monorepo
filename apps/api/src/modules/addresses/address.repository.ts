import { Prisma, prisma } from "@repo/db";

import type { CreateAddressInput, UpdateAddressInput } from "./address.types.js";

/**
 * Prisma cannot tell "SQL NULL" from "the JSON value null" on a nullable Json
 * column, so it refuses a bare `null` and wants `Prisma.DbNull` instead.
 */
const rawForWrite = (raw: unknown) =>
  raw === undefined || raw === null ? Prisma.DbNull : (raw as Prisma.InputJsonValue);

export const addressRepository = {
  findMany() {
    return prisma.address.findMany({ orderBy: [{ city: "asc" }, { line1: "asc" }] });
  },

  findById(id: string) {
    return prisma.address.findUnique({ where: { id } });
  },

  create(data: CreateAddressInput) {
    return prisma.address.create({ data: { ...data, raw: rawForWrite(data.raw) } });
  },

  update(id: string, data: UpdateAddressInput) {
    return prisma.address.update({ where: { id }, data: { ...data, raw: rawForWrite(data.raw) } });
  },

  delete(id: string) {
    return prisma.address.delete({ where: { id } });
  },
};
