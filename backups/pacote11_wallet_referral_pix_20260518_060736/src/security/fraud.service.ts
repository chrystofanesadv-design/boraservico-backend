import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FraudService {
  constructor(private prisma: PrismaService) {}

  // 🚫 DUPLO PAGAMENTO
  async validateEscrowRelease(
    serviceOrderId: string,
  ) {
    const escrow = await this.prisma.escrow.findFirst({
      where: {
        serviceOrderId,
      },
    });

    if (!escrow) {
      throw new Error('Escrow não encontrado');
    }

    if (escrow.status === 'RELEASED') {
      throw new Error('Pagamento já liberado');
    }

    return true;
  }

  // 🚫 DUPLA DISPUTA
  async validateDispute(
    serviceOrderId: string,
  ) {
    const dispute = await this.prisma.dispute.findFirst({
      where: {
        serviceOrderId,
      },
    });

    if (
      dispute &&
      dispute.status !== 'RESOLVED'
    ) {
      throw new Error(
        'Já existe disputa aberta',
      );
    }

    return true;
  }

  // 🚫 PROFISSIONAL ACEITANDO PRÓPRIO SERVIÇO
  async validateSelfAccept(
    clientId: string,
    professionalId: string,
  ) {
    if (clientId === professionalId) {
      throw new Error(
        'Profissional não pode aceitar próprio serviço',
      );
    }

    return true;
  }

  // 🚫 SERVIÇO DUPLICADO
  async validateServiceCompletion(
    status: string,
  ) {
    if (status === 'COMPLETED') {
      throw new Error(
        'Serviço já finalizado',
      );
    }

    return true;
  }
}