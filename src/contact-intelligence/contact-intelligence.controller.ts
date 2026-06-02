import { Body, Controller, Get, Post } from '@nestjs/common';
import { ContactIntelligenceService } from './contact-intelligence.service';

@Controller('contact-intelligence')
export class ContactIntelligenceController {
  constructor(private readonly contactIntelligenceService: ContactIntelligenceService) {}

  @Get()
  health() {
    return {
      status: 'ok',
      module: 'contact-intelligence',
      fragmentedPhoneDetection: true,
      fragmentedAddressDetection: true,
      spelledNumberDetection: true,
      protectedChannels: ['chat', 'voice', 'ocr', 'rfq', 'negotiation', 'proposal'],
    };
  }

  @Post('check')
  check(@Body() payload: any) {
    return this.contactIntelligenceService.check(payload ?? {});
  }
}
