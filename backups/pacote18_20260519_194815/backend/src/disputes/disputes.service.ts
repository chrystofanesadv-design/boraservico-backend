import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuditService } from '../security/audit.service';

type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'OVERRIDDEN';
type ResolutionType = 'FULL_REFUND' | 'PARTIAL_REFUND' | 'RELEASE_PAYMENT';

interface Evidence {
  author: 'CLIENT' | 'PROFESSIONAL';
  message: string;
  createdAt: Date;
}

interface DisputeMock {
  id: string;
  orderId: string;
  clientId: string;
  professionalId: string;
  reason: string;
  status: DisputeStatus;
  resolution?: ResolutionType;
  escrowAmount: number;
  releasedAmount?: number;
  refundedAmount?: number;
  evidences: Evidence[];
  aiAnalysis?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DisputesService {
  private disputes: DisputeMock[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
    private readonly auditService: AuditService,
  ) {}

  async create(data: any) {
    const persisted = await this.tryPersistDispute(data);

    if (persisted) {
      const publicDispute = this.toPublicPrismaDispute(persisted);
      this.emitDisputeOpened(publicDispute);
      await this.auditDispute('DISPUTE_OPENED', publicDispute);

      return publicDispute;
    }

    const dispute: DisputeMock = {
      id: crypto.randomUUID(),
      orderId: data?.orderId ?? '',
      clientId: data?.clientId ?? '',
      professionalId: data?.professionalId ?? '',
      reason: data?.reason ?? 'Disputa aberta',
      status: 'OPEN',
      escrowAmount: Number(data?.escrowAmount ?? 0),
      evidences: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.disputes.push(dispute);
    this.emitDisputeOpened(dispute);
    await this.auditDispute('DISPUTE_OPENED', dispute);

    return dispute;
  }

  async findAll() {
    const persisted = await this.prisma.dispute
      .findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      .catch(() => null);

    if (persisted?.length) {
      return persisted.map((dispute) => this.toPublicPrismaDispute(dispute));
    }

    return this.disputes;
  }

  async findOne(id: string) {
    const persisted = await this.prisma.dispute
      .findUnique({ where: { id } })
      .catch(() => null);

    if (persisted) {
      return this.toPublicPrismaDispute(persisted);
    }

    return this.disputes.find((item) => item.id === id) ?? null;
  }

  addClientEvidence(id: string, data: any) {
    const dispute = this.disputes.find((item) => item.id === id);

    if (!dispute) {
      return {
        error: 'DISPUTE_NOT_FOUND',
      };
    }

    dispute.evidences.push({
      author: 'CLIENT',
      message: data?.message ?? '',
      createdAt: new Date(),
    });

    dispute.status = 'UNDER_REVIEW';
    dispute.updatedAt = new Date();
    void this.auditDispute('DISPUTE_RESOLVED', dispute);

    return dispute;
  }

  addProfessionalEvidence(id: string, data: any) {
    const dispute = this.disputes.find((item) => item.id === id);

    if (!dispute) {
      return {
        error: 'DISPUTE_NOT_FOUND',
      };
    }

    dispute.evidences.push({
      author: 'PROFESSIONAL',
      message: data?.message ?? '',
      createdAt: new Date(),
    });

    dispute.status = 'UNDER_REVIEW';
    dispute.updatedAt = new Date();

    return dispute;
  }

  resolve(id: string, data: any) {
    const dispute = this.disputes.find((item) => item.id === id);

    if (!dispute) {
      return {
        error: 'DISPUTE_NOT_FOUND',
      };
    }

    const resolution = data?.resolution ?? 'PARTIAL_REFUND';

    dispute.status = 'RESOLVED';
    dispute.resolution = resolution;

    if (resolution === 'FULL_REFUND') {
      dispute.refundedAmount = dispute.escrowAmount;
      dispute.releasedAmount = 0;
    }

    if (resolution === 'PARTIAL_REFUND') {
      dispute.refundedAmount = dispute.escrowAmount * 0.5;
      dispute.releasedAmount = dispute.escrowAmount * 0.5;
    }

    if (resolution === 'RELEASE_PAYMENT') {
      dispute.refundedAmount = 0;
      dispute.releasedAmount = dispute.escrowAmount;
    }

    dispute.aiAnalysis =
      data?.aiAnalysis ?? 'Analise automatica concluida pela IA do BoraServico.';
    dispute.updatedAt = new Date();

    return dispute;
  }

  override(id: string, data: any) {
    const dispute = this.disputes.find((item) => item.id === id);

    if (!dispute) {
      return {
        error: 'DISPUTE_NOT_FOUND',
      };
    }

    dispute.status = 'OVERRIDDEN';
    dispute.resolution = data?.resolution ?? dispute.resolution;
    dispute.updatedAt = new Date();
    void this.auditDispute('DISPUTE_OVERRIDDEN', dispute);

    return dispute;
  }

  private async tryPersistDispute(data: any) {
    const orderId = this.readString(data?.orderId);
    const clientId = this.readString(data?.clientId);
    const reason = this.readString(data?.reason) ?? 'Disputa aberta';

    if (!orderId || !clientId) {
      return null;
    }

    try {
      return await this.prisma.dispute.create({
        data: {
          serviceOrderId: orderId,
          clientId,
          professionalId: this.readString(data?.professionalId),
          reason,
          status: 'OPEN',
        },
      });
    } catch {
      return null;
    }
  }

  private emitDisputeOpened(dispute: any) {
    const payload = {
      orderId: dispute.orderId,
      disputeId: dispute.id,
      clientId: dispute.clientId,
      professionalId: dispute.professionalId,
      reason: dispute.reason,
      status: dispute.status,
      message: 'Disputa aberta',
      timestamp:
        dispute.createdAt?.toISOString?.() ??
        dispute.createdAt ??
        new Date().toISOString(),
    };

    RealtimeGateway.emitOperational('dispute-opened', payload);
    void this.pushRealService
      .notifyOrderEvent('DISPUTE_OPENED', payload)
      .catch(() => undefined);
  }

  private toPublicPrismaDispute(dispute: any) {
    return {
      success: true,
      id: dispute.id,
      orderId: dispute.serviceOrderId,
      clientId: dispute.clientId,
      professionalId: dispute.professionalId,
      reason: dispute.reason,
      status: dispute.status,
      createdAt: dispute.createdAt,
      updatedAt: dispute.resolvedAt ?? dispute.createdAt,
    };
  }

  private async auditDispute(action: string, dispute: any) {
    await this.auditService.register(action, {
      domain: 'disputes',
      actorId: this.readString(dispute.clientId),
      entityType: 'dispute',
      entityId: this.readString(dispute.id),
      orderId: this.readString(dispute.orderId ?? dispute.serviceOrderId),
      metadata: {
        status: dispute.status,
        professionalId: dispute.professionalId,
        reason: dispute.reason,
        resolution: dispute.resolution,
      },
    });
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
