import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { PaymentsRealProviderController } from './payments-real-provider.controller';
import { PaymentsRealProviderService } from './payments-real-provider.service';

@Module({
  imports: [PaymentsModule],
  controllers: [PaymentsRealProviderController],
  providers: [PaymentsRealProviderService],
})
export class PaymentsProviderModule {}
