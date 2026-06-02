import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async findAll() {
    const payments = await this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      success: true,
      data: payments.map((p) => this.toPublicPayment(p)),
      total: payments.length,
    };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        audits: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado');
    }

    return {
      success: true,
      ...this.toPublicPayment(payment),
      audits: payment.audits.map((a) => ({
        id: a.id,
        action: a.action,
        status: a.status,
        createdAt: a.createdAt,
      })),
    };
  }

  async findPaymentAudits(id: string) {
    const audits = await this.prisma.paymentAudit.findMany({
      where: { paymentId: id },
      orderBy: { createdAt: 'desc' },
    });

    return audits.map((audit) => ({
      id: audit.id,
      action: audit.action,
      status: audit.status,
      metadata: audit.metadata ? JSON.parse(audit.metadata) : null,
      createdAt: audit.createdAt,
    }));
  }

  async getOrderStatus(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      return {
        success: true,
        orderId,
        status: 'PENDING',
        hasPayment: false,
      };
    }

    return {
      success: true,
      orderId,
      paymentId: payment.id,
      status: payment.status,
      escrowStatus: payment.escrowStatus,
      hasPayment: true,
    };
  }

  async createCheckout(orderId: string, provider: string = 'MOCK') {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: orderId },
      include: { client: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado');
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider,
        status: 'PENDING',
        amount: order.price,
        commission: order.price * 0.10,
        escrowStatus: 'HELD',
        metadata: JSON.stringify({
          orderId: order.id,
          clientId: order.clientId,
          amount: order.price,
          createdAt: new Date().toISOString(),
        }),
      },
    });

    if (provider === 'MOCK') {
      await this.simulatePayment(payment.id);
    }

    return {
      success: true,
      paymentId: payment.id,
      provider,
      status: payment.status,
      amount: payment.amount,
    };
  }

  async createEscrow(data: { orderId: string; amount?: number }) {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: data.orderId },
    });

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado');
    }

    const amount = data.amount || order.price;
    const escrow = await this.prisma.escrow.upsert({
      where: { serviceOrderId: data.orderId },
      create: {
        serviceOrderId: data.orderId,
        clientId: order.clientId,
        amount,
        status: 'HELD',
      },
      update: {
        amount,
        status: 'HELD',
        releasedAt: null,
      },
    });
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId: data.orderId,
        status: { in: ['PAID', 'ESCROW_HELD', 'AUTHORIZED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    const protectedPayment =
      payment ??
      (await this.prisma.payment.create({
        data: {
          orderId: data.orderId,
          provider: 'MOCK',
          status: 'ESCROW_HELD',
          amount,
          commission: amount * 0.1,
          escrowStatus: 'HELD',
          paidAt: new Date(),
          metadata: JSON.stringify({
            orderId: data.orderId,
            clientId: order.clientId,
            amount,
            escrowId: escrow.id,
            protectedPayment: true,
            createdAt: new Date().toISOString(),
          }),
        },
      }));

    await this.prisma.paymentAudit.create({
      data: {
        paymentId: protectedPayment.id,
        orderId: data.orderId,
        action: 'PAYMENT_PROTECTED_CONFIRMED',
        status: 'ESCROW_HELD',
        amount,
        metadata: JSON.stringify({
          escrowId: escrow.id,
          protectedPayment: true,
          confirmedAt: new Date().toISOString(),
        }),
      },
    });

    return {
      success: true,
      escrowId: escrow.id,
      paymentId: protectedPayment.id,
      amount: escrow.amount,
      status: protectedPayment.status,
      escrowStatus: escrow.status,
      payment: this.toPublicPayment(protectedPayment),
    };
  }

  async release(id: string) {
    return this.releasePayment(id);
  }

  async releasePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado');
    }

    if (payment.status === 'RELEASED') {
      throw new BadRequestException('Pagamento ja foi liberado');
    }

    const totalAmount = Number(payment.amount);
    const commission = Number(payment.commission);
    const professionalAmount = totalAmount - commission;

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'RELEASED',
        escrowStatus: 'RELEASED',
        releasedAt: new Date(),
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          releasedAt: new Date().toISOString(),
          professionalAmount,
          commission,
        }),
      },
    });

    if (payment.order.professionalId) {
      await this.prisma.walletTransaction.create({
        data: {
          userId: payment.order.professionalId,
          orderId: payment.orderId,
          type: 'PAYMENT_RELEASE',
          amount: professionalAmount,
          status: 'COMPLETED',
          source: 'PAYMENT',
          metadata: JSON.stringify({
            paymentId: payment.id,
            grossAmount: totalAmount,
            commission,
            netAmount: professionalAmount,
          }),
        },
      });

      await this.prisma.wallet.update({
        where: { userId: payment.order.professionalId },
        data: {
          balance: { increment: professionalAmount },
          availableBalance: { increment: professionalAmount },
        },
      });
    }

    await this.prisma.paymentAudit.create({
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        action: 'PAYMENT_RELEASED',
        status: 'RELEASED',
        amount: totalAmount,
        metadata: JSON.stringify({
          professionalAmount,
          commission,
          releasedAt: new Date().toISOString(),
        }),
      },
    });

    return {
      success: true,
      paymentId: payment.id,
      status: 'RELEASED',
      amount: totalAmount,
      commission,
      professionalAmount,
    };
  }

  async releaseForOrder(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado para esta ordem');
    }

    return this.releasePayment(payment.id);
  }

  async refund(id: string, body?: any) {
    return this.refundPayment(id);
  }

  async refundPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado');
    }

    if (payment.status === 'REFUNDED') {
      throw new BadRequestException('Pagamento ja foi reembolsado');
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REFUNDED',
        escrowStatus: 'REFUNDED',
        refundedAt: new Date(),
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          refundedAt: new Date().toISOString(),
        }),
      },
    });

    await this.prisma.paymentAudit.create({
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        action: 'PAYMENT_REFUNDED',
        status: 'REFUNDED',
        amount: Number(payment.amount),
        metadata: JSON.stringify({
          refundedAt: new Date().toISOString(),
        }),
      },
    });

    return {
      success: true,
      paymentId: payment.id,
      status: 'REFUNDED',
      amount: Number(payment.amount),
    };
  }

  async split(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado');
    }

    return {
      success: true,
      paymentId: payment.id,
      status: 'SPLIT_DONE',
      grossAmount: Number(payment.amount),
      commission: Number(payment.commission),
      netAmount: Number(payment.amount) - Number(payment.commission),
    };
  }

  private async simulatePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) return;

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        escrowStatus: 'HELD',
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          paidAt: new Date().toISOString(),
          simulation: true,
        }),
      },
    });

    await this.prisma.paymentAudit.create({
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        action: 'PAYMENT_SIMULATED',
        status: 'PAID',
        amount: payment.amount,
        metadata: JSON.stringify({
          simulation: true,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    return payment;
  }

  async handleWebhook(provider: string, payload: any) {
    await this.prisma.paymentWebhookEvent.create({
      data: {
        provider,
        providerEventId: payload.id?.toString() || uuidv4(),
        providerPaymentId: payload.payment?.toString(),
        status: 'PROCESSED',
        payload: JSON.stringify(payload),
        processedAt: new Date(),
      },
    });

    return { success: true };
  }

  async createPagarmeRecipient(data: any) {
    return {
      success: true,
      recipientId: `recip_${uuidv4()}`,
      userId: data.userId,
      provider: 'PAGARME',
    };
  }

  async getPagarmeRecipientForUser(userId: string) {
    const recipient = await this.prisma.paymentRecipient.findFirst({
      where: { userId, provider: 'PAGARME' },
    });

    if (!recipient) {
      return {
        success: true,
        hasRecipient: false,
        userId,
      };
    }

    return {
      success: true,
      hasRecipient: true,
      recipientId: recipient.providerRecipientId,
      userId,
    };
  }

  private toPublicPayment(payment: any) {
    const contactUnlocked = ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(
      payment.status,
    );

    return {
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      status: payment.status,
      amount: Number(payment.amount),
      commission: Number(payment.commission),
      escrowStatus: payment.escrowStatus,
      contactUnlocked,
      protectedUntilPayment: !contactUnlocked,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
      releasedAt: payment.releasedAt,
      refundedAt: payment.refundedAt,
    };
  }
}
