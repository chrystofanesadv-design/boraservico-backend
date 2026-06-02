import { Module } from '@nestjs/common';
import { ReferralPremiumController } from './referral-premium.controller';
import { ReferralPremiumService } from './referral-premium.service';

@Module({
  controllers: [ReferralPremiumController],
  providers: [ReferralPremiumService],
  exports: [ReferralPremiumService],
})
export class ReferralPremiumModule {}
