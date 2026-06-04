import { Module } from '@nestjs/common';
import { UploadPremiumController } from './upload-premium.controller';
import { UploadPremiumService } from './upload-premium.service';

@Module({
  controllers: [UploadPremiumController],
  providers: [UploadPremiumService],
  exports: [UploadPremiumService],
})
export class UploadPremiumModule {}
