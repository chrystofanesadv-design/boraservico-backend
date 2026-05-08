import { Module } from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { FraudService } from '../security/fraud.service';

@Module({
  providers: [
    PaymentsService,
    PrismaService,
    FraudService,
  ],

  exports: [
    PaymentsService,
  ],
})
export class PaymentsModule {}