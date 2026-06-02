import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { PaymentsRealService } from '../payments-real/payments-real.service';

@Controller('payments-webhook')
export class PaymentsWebhookController {
  constructor(private readonly paymentsRealService: PaymentsRealService) {}

  @Post()
  mercadoPagoWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, any>,
    @Req() req: any,
    @Query() query: Record<string, any>,
  ) {
    return this.paymentsRealService.webhook(
      'mercado-pago',
      body,
      headers,
      req?.rawBody,
      query,
    );
  }

  @Post(':provider')
  providerWebhook(
    @Param('provider') provider: string,
    @Body() body: any,
    @Headers() headers: Record<string, any>,
    @Req() req: any,
    @Query() query: Record<string, any>,
  ) {
    return this.paymentsRealService.webhook(
      provider,
      body,
      headers,
      req?.rawBody,
      query,
    );
  }
}
