import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard } from '../security/admin.guard';
import { FraudService } from './fraud.service';

@Controller('fraud')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Get()
  status() {
    return {
      status: 'ok',
      module: 'fraud',
      protected: true,
      endpoints: ['POST /fraud/analyze', 'GET /fraud/summary', 'GET /fraud/events'],
    };
  }
  @Post('analyze')
  analyze(@Body() body: any, @Req() req: any) {
    return this.fraudService.analyze(body, req.user);
  }

  @Post('orders')
  analyzeOrder(@Body() body: any, @Req() req: any) {
    return this.fraudService.analyzeOrder(body, req.user);
  }

  @Post('payments')
  analyzePayment(@Body() body: any, @Req() req: any) {
    return this.fraudService.analyzePayment(body, req.user);
  }

  @Post('referrals')
  analyzeReferral(@Body() body: any, @Req() req: any) {
    return this.fraudService.analyzeReferral(body, req.user);
  }

  @Post('withdrawals')
  analyzeWithdrawal(@Body() body: any, @Req() req: any) {
    return this.fraudService.analyzeWithdrawal(body, req.user);
  }

  @Post('webhooks')
  analyzeWebhook(@Body() body: any, @Req() req: any) {
    return this.fraudService.analyzeWebhook(body, req.user);
  }

  @Get('summary')
  async summary(@Query('take') take?: string) {
    return {
      success: true,
      averageRisk: await this.fraudService.averageRisk(Number(take ?? 200)),
    };
  }

  @Get('events')
  async events(@Query('take') take?: string) {
    return {
      success: true,
      events: await this.fraudService.recentEvents(Number(take ?? 100)),
    };
  }
}


