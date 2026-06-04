import { Module } from '@nestjs/common';
import { PushPremiumController } from './push-premium.controller';
import { PushPremiumService } from './push-premium.service';

@Module({
  controllers: [PushPremiumController],
  providers: [PushPremiumService],
  exports: [PushPremiumService],
})
export class PushPremiumModule {}
