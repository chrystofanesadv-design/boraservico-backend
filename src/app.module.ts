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
import { ThrottlerModule } from '@nestjs/throttler';
import { UploadModule } from './upload/upload.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PushModule } from './push/push.module';
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
import { PaymentsModule } from './payments/payments.module';
import { DisputesModule } from './disputes/disputes.module';
import { OrdersModule } from './orders/orders.module';
import { HealthModule } from './health/health.module';
import { WalletModule } from './wallet/wallet.module';
import { ReputationModule } from './reputation/reputation.module';
import { ReferralModule } from './referral/referral.module';
import { TrackingModule } from './tracking/tracking.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ObservabilityModule } from './observability/observability.module';
import { TimelineModule } from './timeline/timeline.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
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
    PushModule,
    RealtimeModule,
    UploadModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    EventEmitterModule.forRoot(),

    PrismaModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    MatchingModule,
    PaymentsModule,
    DisputesModule,
    OrdersModule,
    HealthModule,
    WalletModule,
    ReputationModule,
    ReferralModule,
    TrackingModule,
    AiModule,
    NotificationsModule,
    ObservabilityModule,
    TimelineModule,
    ChatModule,
  ],

  controllers: [],
  providers: [],
})
export class AppModule {}


















