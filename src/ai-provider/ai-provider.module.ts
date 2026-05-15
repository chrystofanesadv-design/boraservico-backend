import { Module } from '@nestjs/common';
import { AiRealProviderController } from './ai-real-provider.controller';
import { AiRealProviderService } from './ai-real-provider.service';

@Module({
  controllers: [AiRealProviderController],
  providers: [AiRealProviderService],
})
export class AiProviderModule {}
