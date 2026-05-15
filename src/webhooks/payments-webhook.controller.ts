import { Body, Controller, Headers, Post } from '@nestjs/common';

@Controller('payments-webhook')
export class PaymentsWebhookController {
  @Post()
  webhook(
    @Body() body: any,
    @Headers('x-signature') signature?: string,
  ) {
    return {
      success: true,
      signatureValid: !!signature,
      received: true,
      event: body?.event ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }
}
