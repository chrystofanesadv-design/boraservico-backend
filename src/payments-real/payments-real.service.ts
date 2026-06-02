import { Injectable } from '@nestjs/common';

import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class PaymentsRealService {
  constructor(private readonly paymentsService: PaymentsService) {}

  createCheckout(body: any) {
    return this.paymentsService.createCheckout(body);
  }

  list() {
    return this.paymentsService.findAll();
  }

  webhook(
    provider: string,
    body: any,
    headers: Record<string, any> = {},
    rawBody?: Buffer | string,
    query: Record<string, any> = {},
  ) {
    return this.paymentsService.handleWebhook(provider, {
      ...body,
      _headers: headers,
      _rawBody: rawBody?.toString(),
      _query: query,
    });
  }

  release(body: any) {
    return this.paymentsService.release(body?.paymentId ?? body?.id);
  }

  refund(body: any) {
    return this.paymentsService.refund(body?.paymentId ?? body?.id, body);
  }

  createPagarmeRecipient(body: any) {
    return this.paymentsService.createPagarmeRecipient(body);
  }

  getPagarmeRecipientForUser(userId: string) {
    return this.paymentsService.getPagarmeRecipientForUser(userId);
  }
}
