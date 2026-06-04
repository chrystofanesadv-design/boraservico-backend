import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsRealController } from './payments-real.controller';
import { PaymentsRealService } from './payments-real.service';

@Module({
  imports: [PaymentsModule],
  controllers: [PaymentsRealController],
  providers: [PaymentsRealService],
  exports: [PaymentsRealService],
})
export class PaymentsRealModule {}
