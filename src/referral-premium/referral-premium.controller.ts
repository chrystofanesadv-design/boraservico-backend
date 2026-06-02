import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateReferralPremiumDto, ReferralBonusPreviewDto, ReferralReminderDto } from './referral-premium.dto';
import { ReferralPremiumService } from './referral-premium.service';

@Controller('referral-premium')
export class ReferralPremiumController {
  constructor(private readonly referralPremiumService: ReferralPremiumService) {}

  @Get()
  health() {
    return this.referralPremiumService.health();
  }

  @Get('rules')
  rules() {
    return this.referralPremiumService.getRules();
  }

  @Get('referrals')
  referrals(@Query('userId') userId?: string) {
    return this.referralPremiumService.listReferrals(userId);
  }

  @Get('events')
  events(@Query('userId') userId?: string) {
    return this.referralPremiumService.listEvents(userId);
  }

  @Post('referrals')
  createReferral(@Body() payload: CreateReferralPremiumDto) {
    return this.referralPremiumService.createReferral(payload);
  }

  @Post('bonus/preview')
  previewBonus(@Body() payload: ReferralBonusPreviewDto) {
    return this.referralPremiumService.previewBonus({ ...payload, dryRun: true });
  }

  @Post('bonus/approve')
  approveBonus(@Body() payload: ReferralBonusPreviewDto) {
    return this.referralPremiumService.previewBonus({ ...payload, dryRun: false });
  }

  @Post('reminders')
  reminders(@Body() payload: ReferralReminderDto) {
    return this.referralPremiumService.scheduleReminders(payload);
  }
}
