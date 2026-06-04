import { AnalyticsModule } from './analytics/analytics.module';
import { GrowthAiStudioModule } from './growth-ai-studio/growth-ai-studio.module';
import { LatamReadyEnterpriseModule } from './latam-ready-enterprise/latam-ready-enterprise.module';
import { FinanceEnterpriseModule } from './finance-enterprise/finance-enterprise.module';
import { UploadPremiumModule } from './upload-premium/upload-premium.module';
import { FraudEnterpriseModule } from './fraud-enterprise/fraud-enterprise.module';
import { ProfessionalTeamsModule } from './professional-teams/professional-teams.module';
import { ProfessionalProfileModule } from './professional-profile/professional-profile.module';
import { DealAiModule } from './deal-ai/deal-ai.module';
import { ScopeBudgetModule } from './scope-budget/scope-budget.module';
import { AvailabilityModule } from './availability/availability.module';
import { PaymentsProviderModule } from './payments-provider/payments-provider.module';
import { AiProviderModule } from './ai-provider/ai-provider.module';
import { RealtimeFinalModule } from './realtime-final/realtime-final.module';
import { PushRealModule } from './push-real/push-real.module';
import { AdminModule } from './admin/admin.module';
import { SessionsModule } from './sessions/sessions.module';
import { PrivateStorageModule } from './private-storage/private-storage.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { FraudModule } from './fraud/fraud.module';
import { Module } from '@nestjs/common';
import { GrowthAiEnterpriseModule } from './growth-ai-enterprise/growth-ai-enterprise.module';
import { VoiceTranslationEnterpriseModule } from './voice-translation-enterprise/voice-translation-enterprise.module';
import { ContactIntelligenceModule } from './contact-intelligence/contact-intelligence.module';
import { TrackingPremiumModule } from './tracking-premium/tracking-premium.module';
import { ReferralPremiumModule } from './referral-premium/referral-premium.module';
import { PushPremiumModule } from './push-premium/push-premium.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UploadModule } from './upload/upload.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PaymentsRealModule } from './payments-real/payments-real.module';
import { AiRealModule } from './ai-real/ai-real.module';
import { SecurityModule } from './security/security.module';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { MatchingModule } from './matching/matching.module';
import { DisputesModule } from './disputes/disputes.module';
import { OrdersModule } from './orders/orders.module';
import { HealthModule } from './health/health.module';
import { WalletModule } from './wallet/wallet.module';
import { ReputationModule } from './reputation/reputation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ObservabilityModule } from './observability/observability.module';
import { TimelineModule } from './timeline/timeline.module';
import { ChatModule } from './chat/chat.module';
import { NegotiationsModule } from './negotiations/negotiations.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    AnalyticsModule,
    GrowthAiStudioModule,
    GrowthAiEnterpriseModule,
    VoiceTranslationEnterpriseModule,
    ContactIntelligenceModule,
    FinanceEnterpriseModule,
    LatamReadyEnterpriseModule,
    TrackingPremiumModule, 
    ReferralPremiumModule,
    PushPremiumModule,
    FraudEnterpriseModule,
    ProfessionalTeamsModule,
    ProfessionalProfileModule, 
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    AiProviderModule,
    PaymentsProviderModule,
    RealtimeFinalModule,
    PushRealModule,
    AdminModule,
    FraudModule,
    WebhooksModule,
    PrivateStorageModule,
    SessionsModule,
    SecurityModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AiRealModule,
    PaymentsRealModule,

    RealtimeModule,
    UploadModule,
    UploadPremiumModule,
    EventEmitterModule.forRoot(),

    PrismaModule,
    AuthModule,
    UsersModule,
    AvailabilityModule,
    ScopeBudgetModule,
    DealAiModule,
    ServicesModule,
    MatchingModule,

    DisputesModule,
    OrdersModule,
    HealthModule,
    WalletModule,
    ReputationModule,

    NotificationsModule,
    ObservabilityModule,
    TimelineModule,
    ChatModule,
    NegotiationsModule,
    VoiceModule,
  ],

  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

