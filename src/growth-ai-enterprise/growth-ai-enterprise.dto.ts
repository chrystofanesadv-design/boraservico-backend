export type MarketingChannel = 'tiktok' | 'instagram' | 'youtube_shorts' | 'push' | 'referral' | 'organic';
export type CampaignUrgency = 'low' | 'normal' | 'high' | 'urgent';

export class GrowthCampaignRequestDto {
  city?: string;
  neighborhood?: string;
  profession?: string;
  problem?: string;
  urgency?: CampaignUrgency;
  channel?: MarketingChannel;
  targetAudience?: 'client' | 'professional' | 'both';
  budgetCents?: number;
  expectedJobs?: number;
  metadata?: Record<string, unknown>;
}

export class CityGrowthSignalDto {
  city?: string;
  state?: string;
  country?: string;
  activeClients?: number;
  activeProfessionals?: number;
  openRequests?: number;
  completedOrders?: number;
  referralInvites?: number;
  referralConversions?: number;
  marketingSpendCents?: number;
  grossRevenueCents?: number;
  churnRisk?: number;
  averageTicketCents?: number;
}

export class ViralScoreRequestDto {
  userId?: string;
  referralInvites?: number;
  referralConversions?: number;
  completedOrders?: number;
  sharedCampaigns?: number;
  walletRewardsCents?: number;
  city?: string;
  metadata?: Record<string, unknown>;
}
