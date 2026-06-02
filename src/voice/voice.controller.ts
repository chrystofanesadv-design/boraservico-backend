import { Body, Controller, Get, Post, Req } from '@nestjs/common';

import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Get()
  status() {
    return this.voiceService.status();
  }

  @Post('parse-service')
  parseService(@Body() body: any, @Req() request: any) {
    return this.voiceService.parseService(body, request?.ip);
  }

  @Post('parse-quote')
  parseQuote(@Body() body: any, @Req() request: any) {
    return this.voiceService.parseQuote(body, request?.ip);
  }

  @Post('command')
  parseCommand(@Body() body: any, @Req() request: any) {
    return this.voiceService.parseCommand(body, request?.ip);
  }

  @Post('transcription-log')
  logTranscription(@Body() body: any, @Req() request: any) {
    return this.voiceService.logTranscription(body, request?.ip);
  }

  @Post('language-preferences')
  saveLanguagePreferences(@Body() body: any, @Req() request: any) {
    return this.voiceService.saveLanguagePreferences(body, request?.ip);
  }

  @Post('post-service-summary')
  postServiceSummary(@Body() body: any, @Req() request: any) {
    return this.voiceService.postServiceSummary(body, request?.ip);
  }
}
