import { Module } from '@nestjs/common';

import { AiRealController } from './ai-real.controller';
import { AiRealService } from './ai-real.service';

@Module({
  controllers: [AiRealController],
  providers: [AiRealService],
  exports: [AiRealService],
})
export class AiRealModule {}
