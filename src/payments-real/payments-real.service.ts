import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentsRealService {
  private transactions: any[] = [];

  createCheckout(body: any) {
    const provider = body.provider ?? 'mercado_pago';
    const amount = Number(body.amount ?? 0);
    const commission = Number((amount * 0.1).toFixed(2));
    const professionalAmount = Number((amount - commission).toFixed(2));

    const tx = {
      id: `pay_${Date.now()}`,
      provider,
      status: 'PENDING',
      amount,
      commission,
      professionalAmount,
      escrow: true,
      checkoutUrl: `https://checkout.mock.boraservico.app/${provider}/${Date.now()}`,
      orderId: body.orderId ?? 'ordem-payment-real-ready',
      createdAt: new Date().toISOString(),
    };

    this.transactions.unshift(tx);
    return tx;
  }

  list() {
    return this.transactions;
  }

  webhook(provider: string, body: any) {
    const event = {
      id: `webhook_${Date.now()}`,
      provider,
      body,
      receivedAt: new Date().toISOString(),
    };

    return {
      success: true,
      event,
    };
  }

  release(body: any) {
    return {
      success: true,
      paymentId: body.paymentId,
      status: 'RELEASED',
      releasedAt: new Date().toISOString(),
    };
  }

  refund(body: any) {
    return {
      success: true,
      paymentId: body.paymentId,
      status: 'REFUNDED',
      refundedAt: new Date().toISOString(),
    };
  }
}
