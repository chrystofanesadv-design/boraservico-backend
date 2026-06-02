import { Module } from '@nestjs/common';
import { DealAiController } from './deal-ai.controller';
import { DealAiService } from './deal-ai.service';

@Module({
  controllers: [DealAiController],
  providers: [DealAiService],
  exports: [DealAiService],
})
export class DealAiModule {}
