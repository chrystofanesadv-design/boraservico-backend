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
  ],

  controllers: [],
  providers: [],
})
export class AppModule {}