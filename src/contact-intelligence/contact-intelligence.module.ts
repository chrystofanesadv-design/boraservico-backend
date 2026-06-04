import { Module } from '@nestjs/common';
import { ContactIntelligenceController } from './contact-intelligence.controller';
import { ContactIntelligenceService } from './contact-intelligence.service';

@Module({
  controllers: [ContactIntelligenceController],
  providers: [ContactIntelligenceService],
  exports: [ContactIntelligenceService],
})
export class ContactIntelligenceModule {}
