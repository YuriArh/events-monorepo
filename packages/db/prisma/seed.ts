import { prisma } from "../src/index.js";

/**
 * Idempotent: clears the tables it owns, then recreates a known set. Keeping
 * dev data reproducible means `migrate reset` costs nothing, which is what
 * stops a reset from being a scary decision.
 */
const seed = async () => {
  await prisma.event.deleteMany();
  await prisma.address.deleteMany();

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
      },
      {
        name: "Design review",
        description: "Walkthrough of the new event pages.",
        startsAt: from(2, 14),
        endsAt: from(2, 15),
        addressId: riverside.id,
      },
      // 1:1 — this event has no venue; riverside is already taken above.
      { name: "Community meetup", startsAt: from(21, 18) },
      // No venue yet, to exercise the optional relation.
      { name: "Unscheduled retro" },
    ],
  });

  const [addresses, events] = await Promise.all([prisma.address.count(), prisma.event.count()]);
  console.log(`Seeded ${addresses} addresses and ${events} events.`);
};

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
