import { Module } from '@nestjs/common';
import { PaymentsRealProviderController } from './payments-real-provider.controller';
import { PaymentsRealProviderService } from './payments-real-provider.service';

@Module({
  controllers: [PaymentsRealProviderController],
  providers: [PaymentsRealProviderService],
})
export class PaymentsProviderModule {}
