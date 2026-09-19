/*
  Warnings:

  - You are about to drop the column `address` on the `Event` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "address",
ADD COLUMN     "addressId" TEXT;

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Address_city_idx" ON "Address"("city");

-- CreateIndex
CREATE INDEX "Event_addressId_idx" ON "Event"("addressId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
