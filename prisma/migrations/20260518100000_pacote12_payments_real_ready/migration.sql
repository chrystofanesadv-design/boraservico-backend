ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'PAGARME';

CREATE TABLE IF NOT EXISTS "PaymentAudit" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT,
    "provider" "PaymentProvider",
    "action" TEXT NOT NULL,
    "status" "PaymentStatus",
    "amount" DECIMAL(12,2),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "paymentId" TEXT,
    "signatureDigest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaymentAudit_paymentId_createdAt_idx" ON "PaymentAudit"("paymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAudit_orderId_createdAt_idx" ON "PaymentAudit"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAudit_action_idx" ON "PaymentAudit"("action");

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_providerPaymentId_idx" ON "PaymentWebhookEvent"("provider", "providerPaymentId");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_paymentId_idx" ON "PaymentWebhookEvent"("paymentId");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_status_idx" ON "PaymentWebhookEvent"("status");

ALTER TABLE "PaymentAudit"
  ADD CONSTRAINT "PaymentAudit_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentWebhookEvent"
  ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
