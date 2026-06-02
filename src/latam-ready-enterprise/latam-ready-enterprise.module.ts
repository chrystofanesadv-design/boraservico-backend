import { Module } from '@nestjs/common';
import { LatamReadyEnterpriseController } from './latam-ready-enterprise.controller';
import { LatamReadyEnterpriseService } from './latam-ready-enterprise.service';

@Module({
  controllers: [LatamReadyEnterpriseController],
  providers: [LatamReadyEnterpriseService],
  exports: [LatamReadyEnterpriseService],
})
export class LatamReadyEnterpriseModule {}
