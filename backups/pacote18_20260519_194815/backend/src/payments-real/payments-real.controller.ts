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
  getPagarmeWebhookSecret,
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
      mercadoPagoReady: Boolean(getMercadoPagoAccessToken()),
      mercadoPagoWebhookReady: Boolean(getMercadoPagoWebhookSecret()),
      pagarmeReady: Boolean(getPagarmeApiKey()),
      pagarmeWebhookReady: Boolean(getPagarmeWebhookSecret()),
      timestamp: new Date().toISOString(),
    };
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
