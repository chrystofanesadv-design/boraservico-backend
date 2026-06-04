import { Module } from '@nestjs/common';
import { FraudEnterpriseController } from './fraud-enterprise.controller';
import { FraudEnterpriseService } from './fraud-enterprise.service';

@Module({
  controllers: [FraudEnterpriseController],
  providers: [FraudEnterpriseService],
  exports: [FraudEnterpriseService],
})
export class FraudEnterpriseModule {}
