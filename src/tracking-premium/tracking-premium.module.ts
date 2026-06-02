import { Module } from '@nestjs/common';
import { TrackingPremiumController } from './tracking-premium.controller';
import { TrackingPremiumService } from './tracking-premium.service';

@Module({
  controllers: [TrackingPremiumController],
  providers: [TrackingPremiumService],
  exports: [TrackingPremiumService],
})
export class TrackingPremiumModule {}
