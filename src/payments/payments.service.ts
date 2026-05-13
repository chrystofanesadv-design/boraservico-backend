import { Injectable } from '@nestjs/common';

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

  createEscrow(data: any) {
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

  release(id: string) {
    const payment = this.findOne(id);

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

  refund(id: string, data: any) {
    const payment = this.findOne(id);

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

  split(id: string) {
    const payment = this.findOne(id);

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

  findAll() {
    return this.payments;
  }

  findOne(id: string) {
    return this.payments.find((item) => item.id === id) ?? null;
  }
}