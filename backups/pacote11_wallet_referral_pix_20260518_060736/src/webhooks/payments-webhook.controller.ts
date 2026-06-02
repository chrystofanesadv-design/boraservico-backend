import { Body, Controller, Headers, Post } from '@nestjs/common';

import { UnauthorizedException } from '@nestjs/common';
import { getMercadoPagoWebhookSecret } from '../config/env';

@Controller('payments-webhook')
export class PaymentsWebhookController {
  @Post()
  webhook(@Body() body: any, @Headers('x-signature') signature?: string) {
    const webhookSecret = getMercadoPagoWebhookSecret();

    if (webhookSecret && !signature) {
      throw new UnauthorizedException('Missing Mercado Pago webhook signature');
    }

    return {
      success: true,
      webhookSecretConfigured: Boolean(webhookSecret),
      signaturePresent: Boolean(signature),
      received: true,
      event: body?.event ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }
}
