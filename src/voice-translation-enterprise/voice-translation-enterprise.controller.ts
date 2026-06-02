import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { VoiceTranslationEnterpriseService } from './voice-translation-enterprise.service';

@Controller('voice-translation-enterprise')
export class VoiceTranslationEnterpriseController {
  constructor(private readonly voiceTranslationEnterpriseService: VoiceTranslationEnterpriseService) {}

  @Get()
  health() {
    return this.voiceTranslationEnterpriseService.status();
  }

  @Post('translate-voice')
  translateVoice(@Body() payload: any) {
    return this.voiceTranslationEnterpriseService.translateVoice(payload ?? {});
  }

  @Post('translate-chat')
  translateChat(@Body() payload: any) {
    return this.voiceTranslationEnterpriseService.translateChat(payload ?? {});
  }

  @Get('history/:orderId')
  historyByOrder(@Param('orderId') orderId: string) {
    return this.voiceTranslationEnterpriseService.listHistory(orderId);
  }

  @Get('history')
  history() {
    return this.voiceTranslationEnterpriseService.listHistory();
  }
}
