import { afterAll, beforeEach } from "vitest";

import { prisma } from "@repo/db";

beforeEach(async () => {
    await prisma.event.deleteMany();
});

afterAll(async () => {
    await prisma.$disconnect();
});
