-- Orçamento Perfeito com IA Intermediadora.
-- A IA organiza briefing, riscos e comparação; preços continuam humanos.

CREATE TABLE IF NOT EXISTS "RequestForQuote" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "acceptedOrderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT,
  "address" TEXT,
  "urgency" TEXT,
  "observations" TEXT,
  "photos" TEXT,
  "aiBriefing" TEXT,
  "aiQuestions" TEXT,
  "aiWarnings" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestForQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Negotiation" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "acceptedOrderId" TEXT,
  "clientId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "professionalName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "rating" DOUBLE PRECISION,
  "distanceKm" DOUBLE PRECISION,
  "responseMinutes" INTEGER,
  "score" DOUBLE PRECISION,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Quote" (
  "id" TEXT NOT NULL,
  "negotiationId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "deadline" TEXT,
  "notes" TEXT,
  "includes" TEXT,
  "excludes" TEXT,
  "materialIncluded" BOOLEAN NOT NULL DEFAULT false,
  "etaMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CounterOffer" (
  "id" TEXT NOT NULL,
  "negotiationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CounterOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinalOffer" (
  "id" TEXT NOT NULL,
  "negotiationId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "deadline" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinalOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NegotiationEvent" (
  "id" TEXT NOT NULL,
  "negotiationId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRole" TEXT NOT NULL DEFAULT 'SYSTEM',
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NegotiationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequestForQuote_acceptedOrderId_key" ON "RequestForQuote"("acceptedOrderId");
CREATE INDEX IF NOT EXISTS "RequestForQuote_clientId_createdAt_idx" ON "RequestForQuote"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "RequestForQuote_status_idx" ON "RequestForQuote"("status");
CREATE INDEX IF NOT EXISTS "RequestForQuote_category_idx" ON "RequestForQuote"("category");

CREATE UNIQUE INDEX IF NOT EXISTS "Negotiation_requestId_professionalId_key" ON "Negotiation"("requestId", "professionalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Negotiation_acceptedOrderId_key" ON "Negotiation"("acceptedOrderId");
CREATE INDEX IF NOT EXISTS "Negotiation_requestId_status_idx" ON "Negotiation"("requestId", "status");
CREATE INDEX IF NOT EXISTS "Negotiation_clientId_status_idx" ON "Negotiation"("clientId", "status");
CREATE INDEX IF NOT EXISTS "Negotiation_professionalId_status_idx" ON "Negotiation"("professionalId", "status");

CREATE INDEX IF NOT EXISTS "Quote_negotiationId_createdAt_idx" ON "Quote"("negotiationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Quote_professionalId_createdAt_idx" ON "Quote"("professionalId", "createdAt");

CREATE INDEX IF NOT EXISTS "CounterOffer_negotiationId_createdAt_idx" ON "CounterOffer"("negotiationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CounterOffer_clientId_createdAt_idx" ON "CounterOffer"("clientId", "createdAt");

CREATE INDEX IF NOT EXISTS "FinalOffer_negotiationId_createdAt_idx" ON "FinalOffer"("negotiationId", "createdAt");
CREATE INDEX IF NOT EXISTS "FinalOffer_professionalId_createdAt_idx" ON "FinalOffer"("professionalId", "createdAt");

CREATE INDEX IF NOT EXISTS "NegotiationEvent_negotiationId_createdAt_idx" ON "NegotiationEvent"("negotiationId", "createdAt");
CREATE INDEX IF NOT EXISTS "NegotiationEvent_type_idx" ON "NegotiationEvent"("type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RequestForQuote_clientId_fkey'
  ) THEN
    ALTER TABLE "RequestForQuote"
    ADD CONSTRAINT "RequestForQuote_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RequestForQuote_acceptedOrderId_fkey'
  ) THEN
    ALTER TABLE "RequestForQuote"
    ADD CONSTRAINT "RequestForQuote_acceptedOrderId_fkey"
    FOREIGN KEY ("acceptedOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Negotiation_requestId_fkey'
  ) THEN
    ALTER TABLE "Negotiation"
    ADD CONSTRAINT "Negotiation_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "RequestForQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Negotiation_acceptedOrderId_fkey'
  ) THEN
    ALTER TABLE "Negotiation"
    ADD CONSTRAINT "Negotiation_acceptedOrderId_fkey"
    FOREIGN KEY ("acceptedOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_negotiationId_fkey'
  ) THEN
    ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_negotiationId_fkey"
    FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CounterOffer_negotiationId_fkey'
  ) THEN
    ALTER TABLE "CounterOffer"
    ADD CONSTRAINT "CounterOffer_negotiationId_fkey"
    FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FinalOffer_negotiationId_fkey'
  ) THEN
    ALTER TABLE "FinalOffer"
    ADD CONSTRAINT "FinalOffer_negotiationId_fkey"
    FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NegotiationEvent_negotiationId_fkey'
  ) THEN
    ALTER TABLE "NegotiationEvent"
    ADD CONSTRAINT "NegotiationEvent_negotiationId_fkey"
    FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
