import { Module } from '@nestjs/common';

import { MatchingService } from './matching.service';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PaymentsService } from '../payments/payments.service';
import { FraudService } from '../security/fraud.service';

@Module({
  providers: [
    MatchingService,
    PrismaService,
    NotificationsGateway,
    PaymentsService,
    FraudService,
  ],

  exports: [MatchingService],
})
export class MatchingModule {}