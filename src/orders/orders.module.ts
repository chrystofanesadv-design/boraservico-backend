import { Module } from '@nestjs/common';

import { FraudModule } from '../fraud/fraud.module';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { TimelineModule } from '../timeline/timeline.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PaymentsModule, FraudModule, MatchingModule, TimelineModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
