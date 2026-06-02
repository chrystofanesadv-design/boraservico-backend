import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import {
  getMercadoPagoAccessToken,
  getMercadoPagoWebhookSecret,
  getPagarmeApiKey,
  getPagarmePlatformRecipientId,
  getPagarmeRecipientId,
  getPagarmeWebhookSecret,
  getPlatformCommissionRate,
} from '../config/env';
import { PaymentsRealService } from './payments-real.service';

@Controller('payments-real')
export class PaymentsRealController {
  constructor(private readonly service: PaymentsRealService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('status')
  status() {
    return {
      success: true,
      module: 'payments-real',
      commissionRate: getPlatformCommissionRate(),
      platformSharePercent: Math.round(getPlatformCommissionRate() * 100),
      professionalSharePercent: Math.round(
        (1 - getPlatformCommissionRate()) * 100,
      ),
      mercadoPagoReady: Boolean(getMercadoPagoAccessToken()),
      mercadoPagoWebhookReady: Boolean(getMercadoPagoWebhookSecret()),
      pagarmeReady: Boolean(getPagarmeApiKey()),
      pagarmeWebhookReady: Boolean(getPagarmeWebhookSecret()),
      pagarmeRecipientReady: Boolean(getPagarmeRecipientId()),
      pagarmePlatformRecipientReady: Boolean(getPagarmePlatformRecipientId()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('pagarme/recipients/:userId')
  @UseGuards(JwtAuthGuard)
  getPagarmeRecipient(@Param('userId') userId: string) {
    return this.service.getPagarmeRecipientForUser(userId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@Body() body: any) {
    return this.service.createCheckout(body);
  }

  @Post('release')
  @UseGuards(JwtAuthGuard)
  release(@Body() body: any) {
    return this.service.release(body);
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard)
  refund(@Body() body: any) {
    return this.service.refund(body);
  }

  @Post('pagarme/recipients')
  @UseGuards(JwtAuthGuard)
  createPagarmeRecipient(@Req() req: any, @Body() body: any) {
    return this.service.createPagarmeRecipient({
      ...body,
      userId: body?.userId ?? req?.user?.userId,
    });
  }

  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: string,
    @Body() body: any,
    @Headers() headers: Record<string, any>,
    @Req() req: any,
    @Query() query: Record<string, any>,
  ) {
    return this.service.webhook(provider, body, headers, req?.rawBody, query);
  }
}
