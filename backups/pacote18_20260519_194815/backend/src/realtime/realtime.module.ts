import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeHealthController } from './realtime.health';

@Module({
  imports: [AuthModule, ChatModule],
  controllers: [RealtimeHealthController],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
