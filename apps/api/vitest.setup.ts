import { afterAll, beforeEach } from "vitest";

import { prisma } from "@repo/db";

beforeEach(async () => {
    // Children before parents: events hold FKs into Address and User; sessions
    // and tokens into User.
    await prisma.event.deleteMany();
    await prisma.address.deleteMany();
    await prisma.authToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
});

afterAll(async () => {
    await prisma.$disconnect();
});
