export type PremiumPushEventType =
  | 'RFQ_CREATED'
  | 'RFQ_RECEIVED'
  | 'QUOTE_SENT'
  | 'COUNTER_OFFER'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_REJECTED'
  | 'PAYMENT_PROTECTED'
  | 'PROFESSIONAL_ON_THE_WAY'
  | 'PROFESSIONAL_ARRIVED'
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'SERVICE_COMPLETED'
  | 'WALLET_CREDIT'
  | 'REFERRAL_REMINDER_24H'
  | 'REFERRAL_REMINDER_3D'
  | 'REFERRAL_REMINDER_7D'
  | 'REFERRAL_REWARD'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_UPDATED'
  | 'ANTI_FRAUD_WARNING';

export class PremiumPushPayloadDto {
  userId?: string;
  role?: 'client' | 'professional' | 'admin' | string;
  eventType!: PremiumPushEventType;
  title?: string;
  body?: string;
  orderId?: string;
  rfqId?: string;
  negotiationId?: string;
  amount?: number;
  deepLink?: string;
  metadata?: Record<string, unknown>;
}

export class PremiumPushBulkDto {
  userIds!: string[];
  eventType!: PremiumPushEventType;
  title?: string;
  body?: string;
  orderId?: string;
  rfqId?: string;
  negotiationId?: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
}

export class ReferralReminderScheduleDto {
  userId!: string;
  referralCode?: string;
  createdAt?: string;
}
