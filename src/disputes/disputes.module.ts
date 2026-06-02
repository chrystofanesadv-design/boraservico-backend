import { Module } from '@nestjs/common';

import { FraudModule } from '../fraud/fraud.module';
import { PaymentsModule } from '../payments/payments.module';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [FraudModule, PaymentsModule],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
