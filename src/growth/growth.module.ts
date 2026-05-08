import { Module } from '@nestjs/common';
import { GrowthService } from './growth.service';
import { GrowthController } from './growth.controller';

@Module({
  providers: [GrowthService],
  controllers: [GrowthController]
})
export class GrowthModule {}
