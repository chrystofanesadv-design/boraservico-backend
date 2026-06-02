import { Module } from '@nestjs/common';

import { AiRealModule } from '../ai-real/ai-real.module';
import { AiRealProviderController } from './ai-real-provider.controller';
import { AiRealProviderService } from './ai-real-provider.service';

@Module({
  imports: [AiRealModule],
  controllers: [AiRealProviderController],
  providers: [AiRealProviderService],
})
export class AiProviderModule {}
