import { Module } from '@nestjs/common';
import { RealtimeFinalController } from './realtime-final.controller';

@Module({
  controllers: [RealtimeFinalController],
})
export class RealtimeFinalModule {}
