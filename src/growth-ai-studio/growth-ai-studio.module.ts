import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { GrowthAiStudioController } from './growth-ai-studio.controller';
import { GrowthAiStudioService } from './growth-ai-studio.service';

@Module({
  imports: [PrismaModule],
  controllers: [GrowthAiStudioController],
  providers: [GrowthAiStudioService],
  exports: [GrowthAiStudioService],
})
export class GrowthAiStudioModule {}