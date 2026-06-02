import { Module } from '@nestjs/common';

import { FraudModule } from '../fraud/fraud.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

@Module({
  imports: [WalletModule, FraudModule],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
