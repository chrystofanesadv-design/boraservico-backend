/*
  Warnings:

  - You are about to alter the column `price` on the `ServiceOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.

*/
-- DropForeignKey
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_userId_fkey";

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "professionalId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30);

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
