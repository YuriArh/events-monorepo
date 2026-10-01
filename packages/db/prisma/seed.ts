import argon2 from "argon2";

import { prisma } from "../src/index.js";

/**
 * Idempotent: clears the tables it owns, then recreates a known set. Keeping
 * dev data reproducible means `migrate reset` costs nothing, which is what
 * stops a reset from being a scary decision.
 */
const seed = async () => {
  await prisma.event.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany(); // sessions and tokens cascade

  // Same algorithm as the API (apps/api/src/lib/password.ts), so these log in.
  const passwordHash = await argon2.hash("password123", { type: argon2.argon2id });
  const verified = new Date();

  await prisma.user.create({
    data: { email: "admin@example.test", name: "Admin", role: "ADMIN", passwordHash, emailVerifiedAt: verified },
  });
  const user = await prisma.user.create({
    data: { email: "user@example.test", name: "Sample User", passwordHash, emailVerifiedAt: verified },
  });

  const townHall = await prisma.address.create({
    data: {
      label: "Town Hall",
      line1: "1 Civic Square",
      city: "Amsterdam",
      postalCode: "1011 AB",
      country: "NL",
    },
  });

  const riverside = await prisma.address.create({
    data: {
      label: "Riverside Studio",
      line1: "42 Dock Road",
      line2: "Unit 3",
      city: "Rotterdam",
      postalCode: "3011 CD",
      country: "NL",
    },
  });

  const day = 24 * 60 * 60 * 1000;
  const from = (days: number, hour: number) => {
    const date = new Date(Date.now() + days * day);
    date.setHours(hour, 0, 0, 0);
    return date;
  };

  await prisma.event.createMany({
    data: [
      {
        name: "Team offsite",
        description: "Two days of planning and a long lunch.",
        startsAt: from(7, 9),
        endsAt: from(8, 17),
        addressId: townHall.id,
        organizerId: user.id,
      },
      {
        name: "Design review",
        description: "Walkthrough of the new event pages.",
        startsAt: from(2, 14),
        endsAt: from(2, 15),
        addressId: riverside.id,
        organizerId: user.id,
      },
      // 1:1 — this event has no venue; riverside is already taken above.
      { name: "Community meetup", startsAt: from(21, 18), organizerId: user.id },
      // No venue yet, to exercise the optional relation.
      { name: "Unscheduled retro", organizerId: user.id },
    ],
  });

  const [users, addresses, events] = await Promise.all([
    prisma.user.count(),
    prisma.address.count(),
    prisma.event.count(),
  ]);
  console.log(`Seeded ${users} users, ${addresses} addresses and ${events} events.`);
  console.log("Sign in as admin@example.test or user@example.test, password: password123");
};

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
