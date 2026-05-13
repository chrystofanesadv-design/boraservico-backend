import { Module } from '@nestjs/common';
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







