/*
  Warnings:

  - A unique constraint covering the columns `[addressId]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Event_addressId_key" ON "Event"("addressId");
