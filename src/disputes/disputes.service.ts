import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { FraudService } from '../security/fraud.service';

@Injectable()
export class DisputesService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private fraudService: FraudService,
  ) {}

  // ⚖️ ABRIR DISPUTA
  async createDispute(data: {
    serviceOrderId: string;
    clientId: string;
    professionalId?: string;
    reason: string;
  }) {
    // 🚫 evita disputa duplicada
    await this.fraudService.validateDispute(
      data.serviceOrderId,
    );

    return this.prisma.dispute.create({
      data: {
        serviceOrderId: data.serviceOrderId,
        clientId: data.clientId,
        professionalId: data.professionalId,
        reason: data.reason,
        status: 'OPEN',
      },
    });
  }

  // 📋 LISTAR DISPUTAS
  async findAll() {
    return this.prisma.dispute.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // 🔎 BUSCAR UMA
  async findOne(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: {
        id,
      },
    });

    if (!dispute) {
      throw new Error('Disputa não encontrada');
    }

    return dispute;
  }

  // 👤 CLIENTE RESPONDE
  async clientResponse(
    id: string,
    message: string,
  ) {
    return this.prisma.dispute.update({
      where: {
        id,
      },
      data: {
        status: 'CLIENT',
        resolution: message,
      },
    });
  }

  // 👷 PROFISSIONAL RESPONDE
  async professionalResponse(
    id: string,
    message: string,
  ) {
    return this.prisma.dispute.update({
      where: {
        id,
      },
      data: {
        status: 'PROFESSIONAL',
        resolution: message,
      },
    });
  }

  // 🧠 RESOLVER DISPUTA
  async resolve(
    id: string,
    decision:
      | 'CLIENT_WINS'
      | 'PROFESSIONAL_WINS'
      | 'PARTIAL_REFUND',
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: {
        id,
      },
    });

    if (!dispute) {
      throw new Error('Disputa não encontrada');
    }

    // 🚫 evita resolver 2x
    if (dispute.status === 'RESOLVED') {
      throw new Error('Disputa já resolvida');
    }

    // 💣 resolve disputa
    const updated = await this.prisma.dispute.update({
      where: {
        id,
      },
      data: {
        status: 'RESOLVED',
        resolution: decision,
        resolvedAt: new Date(),
      },
    });

    // 💰 ENGINE FINANCEIRA
    if (decision === 'CLIENT_WINS') {
      await this.payments.refundEscrow(
        dispute.serviceOrderId,
      );
    }

    if (decision === 'PROFESSIONAL_WINS') {
      await this.payments.releasePayment(
        dispute.serviceOrderId,
      );
    }

    if (decision === 'PARTIAL_REFUND') {
      await this.payments.partialRefund(
        dispute.serviceOrderId,
      );
    }

    return updated;
  }

  // 🔥 ADMIN FORCE OVERRIDE
  async forceResolve(
    id: string,
    body: {
      decision: string;
    },
  ) {
    return this.prisma.dispute.update({
      where: {
        id,
      },
      data: {
        status: 'RESOLVED',
        resolution: body.decision,
        resolvedAt: new Date(),
      },
    });
  }
}