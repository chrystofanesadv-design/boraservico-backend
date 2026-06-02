import { Module } from '@nestjs/common';
import { PaymentsRealController } from './payments-real.controller';
import { PaymentsRealService } from './payments-real.service';

@Module({
  controllers: [PaymentsRealController],
  providers: [PaymentsRealService],
})
export class PaymentsRealModule {}
