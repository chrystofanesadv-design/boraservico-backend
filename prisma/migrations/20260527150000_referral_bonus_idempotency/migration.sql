ALTER TABLE "ReferralBonus" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralBonus_idempotencyKey_key"
  ON "ReferralBonus"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "ReferralBonus_idempotencyKey_idx"
  ON "ReferralBonus"("idempotencyKey");
