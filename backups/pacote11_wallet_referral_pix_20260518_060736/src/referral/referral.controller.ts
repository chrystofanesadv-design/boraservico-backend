import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { ReferralService } from './referral.service';

@Controller('referral')
export class ReferralController {
  constructor(
    private readonly referralService: ReferralService,
  ) {}

  @Post()
  createReferral(@Body() body: any): any {
    return this.referralService.createReferral(body);
  }

  @Get()
  listReferrals(): any {
    return this.referralService.listReferrals();
  }

  @Get('bonuses')
  listBonuses(): any {
    return this.referralService.listBonuses();
  }

  @Get(':id')
  findReferral(@Param('id') id: string): any {
    return this.referralService.findReferral(id);
  }

  @Post('bonus')
  calculateBonus(@Body() body: any): any {
    return this.referralService.calculateBonus(body);
  }
}
