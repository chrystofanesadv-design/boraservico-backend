-- CreateEnum
CREATE TYPE "TrackingEventStatus" AS ENUM ('WAITING', 'CHECKED_IN', 'IN_PROGRESS', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationalTimelineEventType" AS ENUM ('CREATED', 'MATCHING_STARTED', 'PROFESSIONAL_ACCEPTED', 'PROFESSIONAL_ON_THE_WAY', 'CHECKED_IN', 'IN_PROGRESS', 'CHECKED_OUT', 'PROOF_UPLOADED', 'COMPLETED', 'PAYMENT_RELEASED', 'CANCELLED', 'DISPUTE_OPENED', 'RATING_REQUESTED');

-- CreateEnum
CREATE TYPE "TimelineEventState" AS ENUM ('COMPLETE', 'CURRENT', 'UPCOMING', 'ALERT');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'ESCROW_REFUND', 'PAYMENT_RELEASE', 'REFERRAL_BONUS', 'PIX_WITHDRAWAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTransactionSource" AS ENUM ('ORDER', 'PAYMENT', 'ESCROW', 'REFERRAL', 'PIX', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PHASE_1', 'PHASE_2', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProofVisibility" AS ENUM ('PRIVATE', 'ORDER_PARTICIPANTS', 'SUPPORT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ChatSenderRole" AS ENUM ('CLIENT', 'PROFESSIONAL', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MERCADO_PAGO', 'PIX', 'STRIPE', 'MANUAL', 'MOCK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'ESCROW_HELD', 'RELEASED', 'REFUNDED', 'PARTIAL_REFUND', 'SPLIT_DONE', 'CANCELED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceStatus" ADD VALUE 'CHECKED_IN';
ALTER TYPE "ServiceStatus" ADD VALUE 'CHECKED_OUT';
ALTER TYPE "ServiceStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Escrow" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "address" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "category" TEXT,
ADD COLUMN     "checkInAt" TIMESTAMP(3),
ADD COLUMN     "checkOutAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "ServiceOrder" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fcmToken" TEXT;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "availableBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "escrowBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "Wallet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "actorId" TEXT,
    "status" "TrackingEventStatus" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTimelineEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OperationalTimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "state" "TimelineEventState" NOT NULL DEFAULT 'CURRENT',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "OperationalTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "source" "WalletTransactionSource" NOT NULL DEFAULT 'SYSTEM',
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PHASE_1',
    "phase1StartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phase1EndAt" TIMESTAMP(3) NOT NULL,
    "phase1Percent" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "phase1Limit" DECIMAL(12,2) NOT NULL DEFAULT 300,
    "phase1Earned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "phase2StartAt" TIMESTAMP(3),
    "phase2EndAt" TIMESTAMP(3),
    "phase2Percent" DECIMAL(5,4) NOT NULL DEFAULT 0.025,
    "phase2Limit" DECIMAL(12,2) NOT NULL DEFAULT 200,
    "phase2Earned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalLimit" DECIMAL(12,2) NOT NULL DEFAULT 500,
    "totalEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralBonus" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "orderId" TEXT,
    "serviceValue" DECIMAL(12,2) NOT NULL,
    "phase" INTEGER NOT NULL,
    "percentage" DECIMAL(5,4) NOT NULL,
    "bonusAmount" DECIMAL(12,2) NOT NULL,
    "withdrawable" BOOLEAN NOT NULL DEFAULT true,
    "walletTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofUpload" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "visibility" "ProofVisibility" NOT NULL DEFAULT 'ORDER_PARTICIPANTS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "ChatSenderRole" NOT NULL DEFAULT 'SYSTEM',
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "completedServices" INTEGER NOT NULL DEFAULT 0,
    "cancelledServices" INTEGER NOT NULL DEFAULT 0,
    "responseTimeScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "reliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "reputationScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReputationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MERCADO_PAGO',
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "escrowStatus" "EscrowStatus" NOT NULL DEFAULT 'HELD',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingEvent_orderId_timestamp_idx" ON "TrackingEvent"("orderId", "timestamp");

-- CreateIndex
CREATE INDEX "TrackingEvent_actorId_idx" ON "TrackingEvent"("actorId");

-- CreateIndex
CREATE INDEX "OperationalTimelineEvent_orderId_timestamp_idx" ON "OperationalTimelineEvent"("orderId", "timestamp");

-- CreateIndex
CREATE INDEX "OperationalTimelineEvent_type_idx" ON "OperationalTimelineEvent"("type");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_timestamp_idx" ON "WalletTransaction"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "WalletTransaction_orderId_idx" ON "WalletTransaction"("orderId");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- CreateIndex
CREATE INDEX "WalletTransaction_source_idx" ON "WalletTransaction"("source");

-- CreateIndex
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");

-- CreateIndex
CREATE INDEX "Referral_referredUserId_status_idx" ON "Referral"("referredUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referrerId_referredUserId_key" ON "Referral"("referrerId", "referredUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralBonus_walletTransactionId_key" ON "ReferralBonus"("walletTransactionId");

-- CreateIndex
CREATE INDEX "ReferralBonus_referralId_idx" ON "ReferralBonus"("referralId");

-- CreateIndex
CREATE INDEX "ReferralBonus_referrerId_idx" ON "ReferralBonus"("referrerId");

-- CreateIndex
CREATE INDEX "ReferralBonus_orderId_idx" ON "ReferralBonus"("orderId");

-- CreateIndex
CREATE INDEX "ProofUpload_orderId_createdAt_idx" ON "ProofUpload"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ProofUpload_userId_idx" ON "ProofUpload"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_orderId_createdAt_idx" ON "ChatMessage"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationProfile_userId_key" ON "ReputationProfile"("userId");

-- CreateIndex
CREATE INDEX "Review_reviewedId_createdAt_idx" ON "Review"("reviewedId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_reviewerId_reviewedId_key" ON "Review"("orderId", "reviewerId", "reviewedId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_provider_providerPaymentId_idx" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_escrowStatus_idx" ON "Payment"("escrowStatus");

-- CreateIndex
CREATE INDEX "ServiceOrder_clientId_idx" ON "ServiceOrder"("clientId");

-- CreateIndex
CREATE INDEX "ServiceOrder_professionalId_idx" ON "ServiceOrder"("professionalId");

-- CreateIndex
CREATE INDEX "ServiceOrder_status_idx" ON "ServiceOrder"("status");

-- CreateIndex
CREATE INDEX "ServiceOrder_category_idx" ON "ServiceOrder"("category");

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTimelineEvent" ADD CONSTRAINT "OperationalTimelineEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralBonus" ADD CONSTRAINT "ReferralBonus_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralBonus" ADD CONSTRAINT "ReferralBonus_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofUpload" ADD CONSTRAINT "ProofUpload_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofUpload" ADD CONSTRAINT "ProofUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationProfile" ADD CONSTRAINT "ReputationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewedId_fkey" FOREIGN KEY ("reviewedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
