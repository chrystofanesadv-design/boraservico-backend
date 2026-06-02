import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeHealthController } from './realtime.health';

@Module({
  controllers: [RealtimeHealthController],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
