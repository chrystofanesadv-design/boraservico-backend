import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';

import { ReferralService } from './referral.service';

@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('me')
  me(@Req() req: any, @Query('userId') userId?: string) {
    return this.referralService.getMe(this.resolveUserId(req, { userId }));
  }

  @Get('share')
  share(@Req() req: any, @Query('userId') userId?: string) {
    return this.referralService.createShareContract(
      this.resolveUserId(req, { userId }),
    );
  }

  @Post('create')
  create(@Req() req: any, @Body() body: any) {
    return this.referralService.createShareContract(
      this.resolveUserId(req, body),
    );
  }

  @Post('apply')
  apply(@Req() req: any, @Body() body: any) {
    return this.referralService.applyReferral({
      ...body,
      referredUserId:
        req?.user?.userId ?? body?.referredUserId ?? body?.userId,
    });
  }

  @Post('calculate-bonus')
  calculateReferralBonus(@Body() body: any) {
    return this.referralService.calculateBonus(body);
  }

  @Get('history')
  history(
    @Req() req: any,
    @Query('userId') userId?: string,
    @Query('take') take?: string,
  ) {
    return this.referralService.getHistory(
      this.resolveUserId(req, { userId }),
      this.readTake(take),
    );
  }

  @Post()
  createReferral(@Body() body: any) {
    return this.referralService.createReferral(body);
  }

  @Get()
  listReferrals() {
    return this.referralService.listReferrals();
  }

  @Get('bonuses')
  listBonuses() {
    return this.referralService.listBonuses();
  }

  @Post('bonus')
  calculateBonus(@Body() body: any) {
    return this.referralService.calculateBonus(body);
  }

  @Get(':id')
  findReferral(@Param('id') id: string) {
    return this.referralService.findReferral(id);
  }

  private resolveUserId(req: any, data: any) {
    return req?.user?.userId ?? data?.userId ?? data?.referrerId;
  }

  private readTake(value: any) {
    const take = Number(value ?? 100);
    return Number.isFinite(take) ? Math.min(Math.max(take, 1), 200) : 100;
  }
}
