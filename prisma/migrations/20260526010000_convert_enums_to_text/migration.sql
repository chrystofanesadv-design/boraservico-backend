-- Convert legacy PostgreSQL enum columns to TEXT to match schema.prisma.
-- Values are preserved with USING column::TEXT.

ALTER TABLE "ChatMessage" ALTER COLUMN "senderRole" DROP DEFAULT;
ALTER TABLE "ChatMessage" ALTER COLUMN "senderRole" TYPE TEXT USING "senderRole"::TEXT;
ALTER TABLE "ChatMessage" ALTER COLUMN "senderRole" SET DEFAULT 'SYSTEM';

ALTER TABLE "Dispute" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Dispute" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Dispute" ALTER COLUMN "status" SET DEFAULT 'OPEN';

ALTER TABLE "Escrow" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Escrow" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Escrow" ALTER COLUMN "status" SET DEFAULT 'HELD';

ALTER TABLE "OperationalTimelineEvent" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
ALTER TABLE "OperationalTimelineEvent" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "OperationalTimelineEvent" ALTER COLUMN "state" TYPE TEXT USING "state"::TEXT;
ALTER TABLE "OperationalTimelineEvent" ALTER COLUMN "state" SET DEFAULT 'CURRENT';

ALTER TABLE "Payment" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "provider" TYPE TEXT USING "provider"::TEXT;
ALTER TABLE "Payment" ALTER COLUMN "provider" SET DEFAULT 'MERCADO_PAGO';
ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "Payment" ALTER COLUMN "escrowStatus" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "escrowStatus" TYPE TEXT USING "escrowStatus"::TEXT;
ALTER TABLE "Payment" ALTER COLUMN "escrowStatus" SET DEFAULT 'HELD';

ALTER TABLE "PaymentAudit" ALTER COLUMN "provider" TYPE TEXT USING "provider"::TEXT;
ALTER TABLE "PaymentAudit" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

ALTER TABLE "PaymentRecipient" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "PaymentRecipient" ALTER COLUMN "provider" TYPE TEXT USING "provider"::TEXT;
ALTER TABLE "PaymentRecipient" ALTER COLUMN "provider" SET DEFAULT 'PAGARME';

ALTER TABLE "PaymentWebhookEvent" ALTER COLUMN "provider" TYPE TEXT USING "provider"::TEXT;

ALTER TABLE "ProofUpload" ALTER COLUMN "visibility" DROP DEFAULT;
ALTER TABLE "ProofUpload" ALTER COLUMN "visibility" TYPE TEXT USING "visibility"::TEXT;
ALTER TABLE "ProofUpload" ALTER COLUMN "visibility" SET DEFAULT 'ORDER_PARTICIPANTS';

ALTER TABLE "Referral" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Referral" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Referral" ALTER COLUMN "status" SET DEFAULT 'PHASE_1';

ALTER TABLE "ServiceOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ServiceOrder" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "ServiceOrder" ALTER COLUMN "status" SET DEFAULT 'CREATED';

ALTER TABLE "TrackingEvent" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CLIENT';

ALTER TABLE "WalletTransaction" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
ALTER TABLE "WalletTransaction" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WalletTransaction" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "WalletTransaction" ALTER COLUMN "status" SET DEFAULT 'COMPLETED';
ALTER TABLE "WalletTransaction" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "WalletTransaction" ALTER COLUMN "source" TYPE TEXT USING "source"::TEXT;
ALTER TABLE "WalletTransaction" ALTER COLUMN "source" SET DEFAULT 'SYSTEM';

DROP TYPE IF EXISTS "ChatSenderRole";
DROP TYPE IF EXISTS "DisputeStatus";
DROP TYPE IF EXISTS "EscrowStatus";
DROP TYPE IF EXISTS "OperationalTimelineEventType";
DROP TYPE IF EXISTS "PaymentProvider";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "ProofVisibility";
DROP TYPE IF EXISTS "ReferralStatus";
DROP TYPE IF EXISTS "ServiceStatus";
DROP TYPE IF EXISTS "TimelineEventState";
DROP TYPE IF EXISTS "TrackingEventStatus";
DROP TYPE IF EXISTS "UserRole";
DROP TYPE IF EXISTS "WalletTransactionSource";
DROP TYPE IF EXISTS "WalletTransactionStatus";
DROP TYPE IF EXISTS "WalletTransactionType";
