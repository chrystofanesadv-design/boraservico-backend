import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type PaymentStatus =
  | 'ESCROW_HELD'
  | 'RELEASED'
  | 'REFUNDED'
  | 'PARTIAL_REFUND'
  | 'SPLIT_DONE';

interface PaymentMock {
  id: string;
  orderId: string;
  clientId: string;
  professionalId: string;
  amount: number;
  platformFee: number;
  professionalAmount: number;
  refundAmount: number;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  releasedAt?: Date;
  refundedAt?: Date;
}

@Injectable()
export class PaymentsService {
  private payments: PaymentMock[] = [];

  private readonly platformCommissionRate = 0.10;

  constructor(private readonly prisma: PrismaService) {}

  async createEscrow(data: any) {
    const persisted = await this.tryCreatePersistedEscrow(data);

    if (persisted) {
      return persisted;
    }

    const amount = Number(data?.amount ?? 0);
    const platformFee = amount * this.platformCommissionRate;
    const professionalAmount = amount - platformFee;

    const payment: PaymentMock = {
      id: crypto.randomUUID(),
      orderId: data?.orderId,
      clientId: data?.clientId,
      professionalId: data?.professionalId,
      amount,
      platformFee,
      professionalAmount,
      refundAmount: 0,
      status: 'ESCROW_HELD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.payments.push(payment);

    return payment;
  }

  async release(id: string) {
    const persisted = await this.tryReleasePersistedPayment(id);

    if (persisted) {
      return persisted;
    }

    const payment = this.findFallbackPayment(id);

    if (!payment) {
      return {
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    payment.status = 'RELEASED';
    payment.releasedAt = new Date();
    payment.updatedAt = new Date();

    return {
      success: true,
      payment,
      walletCredit: {
        userId: payment.professionalId,
        amount: payment.professionalAmount,
        withdrawable: true,
      },
      platformRevenue: payment.platformFee,
    };
  }

  async refund(id: string, data: any) {
    const persisted = await this.tryRefundPersistedPayment(id, data);

    if (persisted) {
      return persisted;
    }

    const payment = this.findFallbackPayment(id);

    if (!payment) {
      return {
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    const refundAmount = Number(data?.refundAmount ?? payment.amount);

    payment.refundAmount = Math.min(refundAmount, payment.amount);

    if (payment.refundAmount >= payment.amount) {
      payment.status = 'REFUNDED';
      payment.professionalAmount = 0;
      payment.platformFee = 0;
    } else {
      payment.status = 'PARTIAL_REFUND';
      payment.professionalAmount =
        payment.amount - payment.refundAmount - payment.platformFee;

      if (payment.professionalAmount < 0) {
        payment.professionalAmount = 0;
      }
    }

    payment.refundedAt = new Date();
    payment.updatedAt = new Date();

    return {
      success: true,
      payment,
      clientRefund: {
        userId: payment.clientId,
        amount: payment.refundAmount,
      },
      professionalCredit: {
        userId: payment.professionalId,
        amount: payment.professionalAmount,
        withdrawable: true,
      },
    };
  }

  async split(id: string) {
    const persisted = await this.trySplitPersistedPayment(id);

    if (persisted) {
      return persisted;
    }

    const payment = this.findFallbackPayment(id);

    if (!payment) {
      return {
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    payment.status = 'SPLIT_DONE';
    payment.updatedAt = new Date();

    return {
      success: true,
      split: {
        total: payment.amount,
        platformFee: payment.platformFee,
        professionalAmount: payment.professionalAmount,
        platformCommissionRate: this.platformCommissionRate,
      },
      payment,
    };
  }

  async findAll() {
    try {
      const payments = await this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return payments.map((payment) => this.toPublicPayment(payment));
    } catch {
      return this.payments;
    }
  }

  async findOne(id: string) {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id },
      });

      return payment ? this.toPublicPayment(payment) : null;
    } catch {
      return this.findFallbackPayment(id);
    }
  }

  private async tryCreatePersistedEscrow(data: any) {
    const orderId = this.readString(data?.orderId);

    if (!orderId) {
      return null;
    }

    const amount = this.roundCurrency(Number(data?.amount ?? 0));
    const commission = this.roundCurrency(
      amount * this.platformCommissionRate,
    );
    const professionalAmount = this.roundCurrency(amount - commission);

    try {
      const payment = await this.prisma.payment.create({
        data: {
          orderId,
          provider: this.normalizeProvider(data?.provider),
          providerPaymentId: this.readString(data?.providerPaymentId),
          status: 'ESCROW_HELD',
          amount,
          commission,
          escrowStatus: 'HELD',
          metadata: {
            clientId: this.readString(data?.clientId),
            professionalId: this.readString(data?.professionalId),
            professionalAmount,
            refundAmount: 0,
          },
        },
      });

      return this.toPublicPayment(payment);
    } catch {
      return null;
    }
  }

  private async tryReleasePersistedPayment(id: string) {
    try {
      const payment = await this.prisma.payment.update({
        where: { id },
        data: {
          status: 'RELEASED',
          escrowStatus: 'RELEASED',
          releasedAt: new Date(),
        },
      });
      const metadata = this.readMetadata(payment.metadata);
      const professionalId = this.readString(metadata.professionalId);
      const professionalAmount = this.roundCurrency(
        Number(metadata.professionalAmount ?? 0),
      );

      if (professionalId && professionalAmount > 0) {
        await this.prisma.wallet.upsert({
          where: { userId: professionalId },
          update: {
            balance: { increment: professionalAmount },
            availableBalance: { increment: professionalAmount },
          },
          create: {
            userId: professionalId,
            balance: professionalAmount,
            availableBalance: professionalAmount,
            escrowBalance: 0,
          },
        });

        await this.prisma.walletTransaction.create({
          data: {
            userId: professionalId,
            orderId: payment.orderId,
            type: 'PAYMENT_RELEASE',
            amount: professionalAmount,
            status: 'COMPLETED',
            source: 'PAYMENT',
            metadata: {
              paymentId: payment.id,
              withdrawable: true,
            },
          },
        });
      }

      return {
        success: true,
        payment: this.toPublicPayment(payment),
        walletCredit: professionalId
          ? {
              userId: professionalId,
              amount: professionalAmount,
              withdrawable: true,
            }
          : undefined,
        platformRevenue: Number(payment.commission ?? 0),
      };
    } catch {
      return null;
    }
  }

  private async tryRefundPersistedPayment(id: string, data: any) {
    try {
      const current = await this.prisma.payment.findUnique({
        where: { id },
      });

      if (!current) {
        return null;
      }

      const amount = Number(current.amount ?? 0);
      const refundAmount = Math.min(
        this.roundCurrency(Number(data?.refundAmount ?? amount)),
        amount,
      );
      const metadata: Record<string, any> = {
        ...this.readMetadata(current.metadata),
        refundAmount,
      };
      const status = refundAmount >= amount ? 'REFUNDED' : 'PARTIAL_REFUND';
      const payment = await this.prisma.payment.update({
        where: { id },
        data: {
          status,
          escrowStatus: 'REFUNDED',
          refundedAt: new Date(),
          metadata,
        },
      });

      return {
        success: true,
        payment: this.toPublicPayment(payment),
        clientRefund: {
          userId: this.readString(metadata.clientId),
          amount: refundAmount,
        },
      };
    } catch {
      return null;
    }
  }

  private async trySplitPersistedPayment(id: string) {
    try {
      const payment = await this.prisma.payment.update({
        where: { id },
        data: {
          status: 'SPLIT_DONE',
        },
      });
      const publicPayment = this.toPublicPayment(payment);

      return {
        success: true,
        split: {
          total: publicPayment.amount,
          platformFee: publicPayment.platformFee,
          professionalAmount: publicPayment.professionalAmount,
          platformCommissionRate: this.platformCommissionRate,
        },
        payment: publicPayment,
      };
    } catch {
      return null;
    }
  }

  private findFallbackPayment(id: string) {
    return this.payments.find((item) => item.id === id) ?? null;
  }

  private toPublicPayment(payment: any) {
    const metadata = this.readMetadata(payment.metadata);
    const amount = Number(payment.amount ?? 0);
    const platformFee = Number(payment.commission ?? 0);
    const professionalAmount = this.roundCurrency(
      Number(metadata.professionalAmount ?? amount - platformFee),
    );

    return {
      id: payment.id,
      orderId: payment.orderId,
      clientId: this.readString(metadata.clientId),
      professionalId: this.readString(metadata.professionalId),
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      amount,
      platformFee,
      commission: platformFee,
      professionalAmount,
      refundAmount: Number(metadata.refundAmount ?? 0),
      status: payment.status,
      escrowStatus: payment.escrowStatus,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      releasedAt: payment.releasedAt,
      refundedAt: payment.refundedAt,
    };
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

  private normalizeProvider(value: any) {
    const provider = this.readString(value)?.toUpperCase();
    const allowed = ['MERCADO_PAGO', 'PIX', 'STRIPE', 'MANUAL', 'MOCK'];

    return provider && allowed.includes(provider) ? provider : 'MERCADO_PAGO';
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }
}
