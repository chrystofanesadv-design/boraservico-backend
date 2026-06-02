-- Pacote 21: recipients reais por usuario para split e payout Pagar.me.
CREATE TABLE "PaymentRecipient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAGARME',
    "providerRecipientId" TEXT NOT NULL,
    "status" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentRecipient_userId_provider_key" ON "PaymentRecipient"("userId", "provider");
CREATE UNIQUE INDEX "PaymentRecipient_provider_providerRecipientId_key" ON "PaymentRecipient"("provider", "providerRecipientId");
CREATE INDEX "PaymentRecipient_userId_idx" ON "PaymentRecipient"("userId");
CREATE INDEX "PaymentRecipient_provider_idx" ON "PaymentRecipient"("provider");

ALTER TABLE "PaymentRecipient"
ADD CONSTRAINT "PaymentRecipient_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
