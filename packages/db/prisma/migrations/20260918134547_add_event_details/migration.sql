-- Nullable additions are safe on a populated table.
ALTER TABLE "Event" ADD COLUMN "address" TEXT,
                    ADD COLUMN "description" TEXT,
                    ADD COLUMN "endsAt" TIMESTAMP(3),
                    ADD COLUMN "imageKey" TEXT;

-- `startsAt` is required, so it goes in as three steps: add it nullable,
-- backfill the existing rows, then enforce NOT NULL. Rows that predate the
-- column have no real event date; seeding from `createdAt` keeps their
-- relative order and avoids inventing a future date.
ALTER TABLE "Event" ADD COLUMN "startsAt" TIMESTAMP(3);


-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");
