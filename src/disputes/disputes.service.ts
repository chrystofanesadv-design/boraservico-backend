import { Injectable } from '@nestjs/common';

type DisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED'
  | 'OVERRIDDEN';

type ResolutionType =
  | 'FULL_REFUND'
  | 'PARTIAL_REFUND'
  | 'RELEASE_PAYMENT';

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

  create(data: any) {
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

    return dispute;
  }

  findAll() {
    return this.disputes;
  }

  findOne(id: string) {
    return this.disputes.find((item) => item.id === id) ?? null;
  }

  addClientEvidence(id: string, data: any) {
    const dispute = this.findOne(id);

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

    return dispute;
  }

  addProfessionalEvidence(id: string, data: any) {
    const dispute = this.findOne(id);

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
    const dispute = this.findOne(id);

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
      data?.aiAnalysis ??
      'Analise automatica concluida pela IA do BoraServico.';

    dispute.updatedAt = new Date();

    return dispute;
  }

  override(id: string, data: any) {
    const dispute = this.findOne(id);

    if (!dispute) {
      return {
        error: 'DISPUTE_NOT_FOUND',
      };
    }

    dispute.status = 'OVERRIDDEN';
    dispute.resolution = data?.resolution ?? dispute.resolution;
    dispute.updatedAt = new Date();

    return dispute;
  }
}
