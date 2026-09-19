import { afterAll, beforeEach } from "vitest";

import { prisma } from "@repo/db";

beforeEach(async () => {
    // Events first: they hold the foreign key into Address.
    await prisma.event.deleteMany();
    await prisma.address.deleteMany();
});

afterAll(async () => {
    await prisma.$disconnect();
});
