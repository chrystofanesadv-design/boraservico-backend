-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'CLIENT', 'PROFESSIONAL', 'RESOLVED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "professionalId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_serviceOrderId_key" ON "Dispute"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
