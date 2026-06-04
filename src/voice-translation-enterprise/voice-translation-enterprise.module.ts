import { Module } from '@nestjs/common';
import { ContactIntelligenceModule } from '../contact-intelligence/contact-intelligence.module';
import { VoiceTranslationEnterpriseController } from './voice-translation-enterprise.controller';
import { VoiceTranslationEnterpriseService } from './voice-translation-enterprise.service';

@Module({
  imports: [ContactIntelligenceModule],
  controllers: [VoiceTranslationEnterpriseController],
  providers: [VoiceTranslationEnterpriseService],
  exports: [VoiceTranslationEnterpriseService],
})
export class VoiceTranslationEnterpriseModule {}
