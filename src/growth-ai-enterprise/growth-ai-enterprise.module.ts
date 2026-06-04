import { Module } from '@nestjs/common';
import { GrowthAiEnterpriseController } from './growth-ai-enterprise.controller';
import { GrowthAiEnterpriseService } from './growth-ai-enterprise.service';

@Module({
  controllers: [GrowthAiEnterpriseController],
  providers: [GrowthAiEnterpriseService],
  exports: [GrowthAiEnterpriseService],
})
export class GrowthAiEnterpriseModule {}
