import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsRealService {
  private transactions: any[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async createCheckout(body: any) {
    const persisted = await this.tryCreatePersistedPayment(body);

    if (persisted) {
      return persisted;
    }

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

  async list() {
    try {
      const payments = await this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return payments.map((payment) => this.toPublicPayment(payment));
    } catch {
      return this.transactions;
    }
  }

  async webhook(provider: string, body: any) {
    const providerPaymentId = this.readString(
      body?.providerPaymentId ?? body?.id ?? body?.data?.id,
    );
    const normalizedProvider = this.normalizeProvider(provider);

    if (providerPaymentId) {
      try {
        await this.prisma.payment.updateMany({
          where: {
            provider: normalizedProvider,
            providerPaymentId,
          },
          data: {
            status: this.normalizePaymentStatus(body?.status),
            metadata: body,
          },
        });
      } catch {
        // Webhook acknowledgement must stay independent from local persistence.
      }
    }

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

  async release(body: any) {
    const updated = await this.tryUpdatePersistedStatus(
      body?.paymentId,
      'RELEASED',
      'RELEASED',
    );

    if (updated) {
      return updated;
    }

    return {
      success: true,
      paymentId: body.paymentId,
      status: 'RELEASED',
      releasedAt: new Date().toISOString(),
    };
  }

  async refund(body: any) {
    const updated = await this.tryUpdatePersistedStatus(
      body?.paymentId,
      'REFUNDED',
      'REFUNDED',
    );

    if (updated) {
      return updated;
    }

    return {
      success: true,
      paymentId: body.paymentId,
      status: 'REFUNDED',
      refundedAt: new Date().toISOString(),
    };
  }

  private async tryCreatePersistedPayment(body: any) {
    const orderId = this.readString(body?.orderId);

    if (!orderId) {
      return null;
    }

    const amount = Number(body.amount ?? 0);
    const commission = Number((amount * 0.1).toFixed(2));
    const provider = this.normalizeProvider(body?.provider);
    const providerPaymentId =
      this.readString(body?.providerPaymentId) ?? `mock_${Date.now()}`;

    try {
      const payment = await this.prisma.payment.create({
        data: {
          orderId,
          provider,
          providerPaymentId,
          status: 'PENDING',
          amount,
          commission,
          escrowStatus: 'HELD',
          metadata: {
            checkoutUrl: `https://checkout.mock.boraservico.app/${provider}/${providerPaymentId}`,
            professionalAmount: Number((amount - commission).toFixed(2)),
          },
        },
      });

      return this.toPublicPayment(payment);
    } catch {
      return null;
    }
  }

  private async tryUpdatePersistedStatus(
    paymentId: any,
    status: string,
    escrowStatus: string,
  ) {
    const id = this.readString(paymentId);

    if (!id) {
      return null;
    }

    try {
      const payment = await this.prisma.payment.update({
        where: { id },
        data: {
          status: status as any,
          escrowStatus: escrowStatus as any,
          releasedAt: status === 'RELEASED' ? new Date() : undefined,
          refundedAt: status === 'REFUNDED' ? new Date() : undefined,
        },
      });

      return {
        success: true,
        paymentId: payment.id,
        status: payment.status,
        payment: this.toPublicPayment(payment),
      };
    } catch {
      return null;
    }
  }

  private toPublicPayment(payment: any) {
    const metadata = this.readMetadata(payment.metadata);
    const checkoutUrl =
      this.readString(metadata.checkoutUrl) ??
      `https://checkout.mock.boraservico.app/${payment.provider}/${payment.id}`;

    return {
      id: payment.id,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      amount: Number(payment.amount ?? 0),
      commission: Number(payment.commission ?? 0),
      professionalAmount: Number(metadata.professionalAmount ?? 0),
      escrow: payment.escrowStatus === 'HELD',
      escrowStatus: payment.escrowStatus,
      checkoutUrl,
      orderId: payment.orderId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private normalizeProvider(value: any) {
    const provider = this.readString(value)?.toUpperCase();
    const allowed = ['MERCADO_PAGO', 'PIX', 'STRIPE', 'MANUAL', 'MOCK'];

    return provider && allowed.includes(provider) ? provider : 'MERCADO_PAGO';
  }

  private normalizePaymentStatus(value: any) {
    const status = this.readString(value)?.toUpperCase();
    const allowed = [
      'PENDING',
      'AUTHORIZED',
      'PAID',
      'ESCROW_HELD',
      'RELEASED',
      'REFUNDED',
      'PARTIAL_REFUND',
      'SPLIT_DONE',
      'CANCELED',
      'FAILED',
    ];

    return status && allowed.includes(status) ? status : 'PAID';
  }

  private readMetadata(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
