import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
      mercadoPagoReady: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      pagarmeReady: Boolean(process.env.PAGARME_API_KEY),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('checkout')
  checkout(@Body() body: any) {
    return this.service.createCheckout(body);
  }

  @Post('release')
  release(@Body() body: any) {
    return this.service.release(body);
  }

  @Post('refund')
  refund(@Body() body: any) {
    return this.service.refund(body);
  }

  @Post('webhook/:provider')
  webhook(@Param('provider') provider: string, @Body() body: any) {
    return this.service.webhook(provider, body);
  }
}
