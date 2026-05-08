import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FraudService } from '../security/fraud.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private fraudService: FraudService,
  ) {}

  // 💰 CRIAR ESCROW
  async createEscrow(
    serviceOrderId: string,
    clientId: string,
    amount: number,
  ) {
    // 🚫 evita escrow duplicado
    const existing = await this.prisma.escrow.findFirst({
      where: {
        serviceOrderId,
      },
    });

    if (existing) {
      throw new Error('Escrow já existe');
    }

    const wallet = await this.getOrCreateWallet(clientId);

    if (wallet.balance < amount) {
      throw new Error('Saldo insuficiente');
    }

    // 🔒 trava saldo
    await this.prisma.wallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        balance: wallet.balance - amount,
      },
    });

    // 📦 cria escrow
    return this.prisma.escrow.create({
      data: {
        serviceOrderId,
        clientId,
        amount,
        status: 'HELD',
      },
    });
  }

  // 💸 LIBERA PAGAMENTO
  async releasePayment(serviceOrderId: string) {
    // 🚫 antifraude
    await this.fraudService.validateEscrowRelease(
      serviceOrderId,
    );

    const escrow = await this.prisma.escrow.findFirst({
      where: {
        serviceOrderId,
      },
    });

    if (!escrow) {
      throw new Error('Escrow não encontrado');
    }

    const order = await this.prisma.serviceOrder.findUnique({
      where: {
        id: serviceOrderId,
      },
    });

    if (!order?.professionalId) {
      throw new Error('Profissional não encontrado');
    }

    const wallet = await this.getOrCreateWallet(
      order.professionalId,
    );

    // 💰 paga profissional
    await this.prisma.wallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        balance: wallet.balance + escrow.amount,
      },
    });

    // 🔓 libera escrow
    return this.prisma.escrow.update({
      where: {
        id: escrow.id,
      },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });
  }

  // 🔁 REEMBOLSO TOTAL
  async refundEscrow(serviceOrderId: string) {
    const escrow = await this.prisma.escrow.findFirst({
      where: {
        serviceOrderId,
      },
    });

    if (!escrow) {
      throw new Error('Escrow não encontrado');
    }

    const wallet = await this.getOrCreateWallet(
      escrow.clientId,
    );

    // 💸 devolve saldo
    await this.prisma.wallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        balance: wallet.balance + escrow.amount,
      },
    });

    return this.prisma.escrow.update({
      where: {
        id: escrow.id,
      },
      data: {
        status: 'REFUNDED',
      },
    });
  }

  // 🔁 REEMBOLSO PARCIAL
  async partialRefund(serviceOrderId: string) {
    const escrow = await this.prisma.escrow.findFirst({
      where: {
        serviceOrderId,
      },
    });

    if (!escrow) {
      throw new Error('Escrow não encontrado');
    }

    const refundAmount = escrow.amount * 0.5;

    const wallet = await this.getOrCreateWallet(
      escrow.clientId,
    );

    // 💸 devolve parcial
    await this.prisma.wallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        balance: wallet.balance + refundAmount,
      },
    });

    return this.prisma.escrow.update({
      where: {
        id: escrow.id,
      },
      data: {
        status: 'REFUNDED',
      },
    });
  }

  // 🧾 WALLET AUTO CREATE
  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: {
        userId,
      },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          balance: 0,
        },
      });
    }

    return wallet;
  }
}