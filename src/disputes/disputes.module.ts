import { Module } from '@nestjs/common';

import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { FraudService } from '../security/fraud.service';

@Module({
  controllers: [DisputesController],

  providers: [
    DisputesService,
    PrismaService,
    PaymentsService,
    FraudService,
  ],
})
export class DisputesModule {}