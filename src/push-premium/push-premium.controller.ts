import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PremiumPushBulkDto, PremiumPushPayloadDto, ReferralReminderScheduleDto } from './push-premium.dto';
import { PushPremiumService } from './push-premium.service';

@Controller('push-premium')
export class PushPremiumController {
  constructor(private readonly pushPremiumService: PushPremiumService) {}

  @Get()
  health() {
    return this.pushPremiumService.health();
  }

  @Get('templates')
  templates() {
    return this.pushPremiumService.getTemplates();
  }

  @Get('events')
  events(@Query('userId') userId?: string) {
    return this.pushPremiumService.listEvents(userId);
  }

  @Post('event')
  createEvent(@Body() payload: PremiumPushPayloadDto) {
    return this.pushPremiumService.createEvent(payload);
  }

  @Post('bulk')
  createBulk(@Body() payload: PremiumPushBulkDto) {
    return this.pushPremiumService.createBulk(payload);
  }

  @Post('referral/reminders')
  scheduleReferralReminders(@Body() payload: ReferralReminderScheduleDto) {
    return this.pushPremiumService.scheduleReferralReminders(payload);
  }
}
