import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { FraudService } from '../fraud/fraud.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushRealService } from '../push-real/push-real.service';
import { AuditService } from '../security/audit.service';
import { filterDirectContact } from '../security/contact-filter';

type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'OVERRIDDEN';
type ResolutionType = 'FULL_REFUND' | 'PARTIAL_REFUND' | 'RELEASE_PAYMENT';
type AiRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AiDisputeDecision = 'RELEASE_PAYMENT' | 'BLOCK_PAYMENT' | 'ADMIN_REVIEW';

interface Evidence {
  author: 'CLIENT' | 'PROFESSIONAL';
  message: string;
  createdAt: Date;
  photos?: unknown[];
  voiceTranscript?: string;
}

interface DisputeAutomationAnalysis {
  score: number;
  recommendedDecision: AiDisputeDecision;
  reason: string;
  riskLevel: AiRiskLevel;
  releasePayment: boolean;
  blockPayment: boolean;
  sendToAdmin: boolean;
  adminReviewRequired: boolean;
  evidence: Record<string, any>;
  fraudRisk?: any;
}

interface DisputeMock {
  id: string;
  orderId: string;
  clientId: string;
  professionalId: string;
  reason: string;
  status: DisputeStatus;
  resolution?: ResolutionType | AiDisputeDecision;
  escrowAmount: number;
  releasedAmount?: number;
  refundedAmount?: number;
  evidences: Evidence[];
  aiAnalysis?: DisputeAutomationAnalysis;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DisputesService {
  private disputes: DisputeMock[] = [];
  private schemaReady?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
    private readonly auditService: AuditService,
    private readonly fraudService: FraudService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(data: any) {
    await this.ensureSchema();

    const analysis = await this.analyzeDispute(data);
    const persisted = await this.tryPersistDispute(data, analysis);

    if (persisted) {
      const paymentAutomation = await this.applyAutomatedPaymentDecision(
        persisted.serviceOrderId,
        analysis,
      );
      const publicDispute = this.toPublicPrismaDispute({
        ...persisted,
        automationApplied: this.stringifyJson(paymentAutomation),
      });

      this.emitDisputeOpened(publicDispute);
      await this.auditDispute('DISPUTE_AI_AUTOMATED', publicDispute, {
        analysis,
        paymentAutomation,
      });

      return publicDispute;
    }

    const dispute: DisputeMock = {
      id: randomUUID(),
      orderId: data?.orderId ?? '',
      clientId: data?.clientId ?? '',
      professionalId: data?.professionalId ?? '',
      reason: data?.reason ?? 'Disputa aberta',
      status: analysis.sendToAdmin ? 'UNDER_REVIEW' : 'RESOLVED',
      resolution: analysis.recommendedDecision,
      escrowAmount: Number(data?.escrowAmount ?? 0),
      evidences: [],
      aiAnalysis: analysis,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.disputes.push(dispute);
    this.emitDisputeOpened(dispute);
    await this.auditDispute('DISPUTE_AI_AUTOMATED_MEMORY', dispute, {
      analysis,
    });

    return dispute;
  }

  async findAll() {
    await this.ensureSchema();

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
    await this.ensureSchema();

    const persisted = await this.prisma.dispute
      .findUnique({ where: { id } })
      .catch(() => null);

    if (persisted) {
      return this.toPublicPrismaDispute(persisted);
    }

    return this.disputes.find((item) => item.id === id) ?? null;
  }

  async addClientEvidence(id: string, data: any) {
    return this.addEvidence(id, data, 'CLIENT');
  }

  async addProfessionalEvidence(id: string, data: any) {
    return this.addEvidence(id, data, 'PROFESSIONAL');
  }

  async resolve(id: string, data: any) {
    await this.ensureSchema();

    const persisted = await this.prisma.dispute
      .findUnique({ where: { id } })
      .catch(() => null);

    if (persisted) {
      const resolution = this.readString(data?.resolution) ?? 'PARTIAL_REFUND';
      const updated = await this.prisma.dispute.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution,
          resolvedAt: new Date(),
          automationApplied: this.stringifyJson({
            action: 'ADMIN_MANUAL_RESOLUTION',
            resolution,
            at: new Date().toISOString(),
          }),
        },
      });

      await this.auditDispute('DISPUTE_RESOLVED', updated, { resolution });

      return this.toPublicPrismaDispute(updated);
    }

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

    dispute.updatedAt = new Date();
    void this.auditDispute('DISPUTE_RESOLVED', dispute, { resolution });

    return dispute;
  }

  async override(id: string, data: any) {
    await this.ensureSchema();

    const persisted = await this.prisma.dispute
      .findUnique({ where: { id } })
      .catch(() => null);

    if (persisted) {
      const updated = await this.prisma.dispute.update({
        where: { id },
        data: {
          status: 'OVERRIDDEN',
          resolution: this.readString(data?.resolution) ?? persisted.resolution,
          automationApplied: this.stringifyJson({
            action: 'ADMIN_OVERRIDE',
            payload: data,
            at: new Date().toISOString(),
          }),
        },
      });

      await this.auditDispute('DISPUTE_OVERRIDDEN', updated, data);

      return this.toPublicPrismaDispute(updated);
    }

    const dispute = this.disputes.find((item) => item.id === id);

    if (!dispute) {
      return {
        error: 'DISPUTE_NOT_FOUND',
      };
    }

    dispute.status = 'OVERRIDDEN';
    dispute.resolution = data?.resolution ?? dispute.resolution;
    dispute.updatedAt = new Date();
    void this.auditDispute('DISPUTE_OVERRIDDEN', dispute, data);

    return dispute;
  }

  private async addEvidence(
    id: string,
    data: any,
    author: 'CLIENT' | 'PROFESSIONAL',
  ) {
    await this.ensureSchema();

    const persisted = await this.prisma.dispute
      .findUnique({ where: { id } })
      .catch(() => null);

    const evidence: Evidence = {
      author,
      message: this.readString(data?.message) ?? '',
      photos: Array.isArray(data?.photos) ? data.photos : undefined,
      voiceTranscript: this.readString(data?.voiceTranscript ?? data?.transcript),
      createdAt: new Date(),
    };

    if (persisted) {
      const previousEvidence = this.parseJson(persisted.aiEvidence, {});
      const list = Array.isArray(previousEvidence?.extraEvidence)
        ? previousEvidence.extraEvidence
        : [];
      const extraEvidence = [...list, evidence];
      const analysis = await this.analyzeDispute({
        ...persisted,
        orderId: persisted.serviceOrderId,
        reason: persisted.reason,
        extraEvidence,
      });
      const updated = await this.prisma.dispute.update({
        where: { id },
        data: {
          status: analysis.sendToAdmin ? 'UNDER_REVIEW' : 'RESOLVED',
          resolution: analysis.recommendedDecision,
          resolvedAt: analysis.sendToAdmin ? null : new Date(),
          aiScore: analysis.score,
          aiDecision: analysis.recommendedDecision,
          aiReason: analysis.reason,
          aiRiskLevel: analysis.riskLevel,
          aiReleasePayment: analysis.releasePayment,
          aiBlockPayment: analysis.blockPayment,
          aiSendToAdmin: analysis.sendToAdmin,
          adminReviewRequired: analysis.adminReviewRequired,
          aiEvidence: this.stringifyJson({
            ...analysis.evidence,
            extraEvidence,
          }),
        },
      });

      await this.auditDispute('DISPUTE_EVIDENCE_AI_REANALYZED', updated, {
        evidence,
        analysis,
      });

      return this.toPublicPrismaDispute(updated);
    }

    const dispute = this.disputes.find((item) => item.id === id);

    if (!dispute) {
      return {
        error: 'DISPUTE_NOT_FOUND',
      };
    }

    dispute.evidences.push(evidence);
    dispute.aiAnalysis = await this.analyzeDispute({
      ...dispute,
      orderId: dispute.orderId,
      extraEvidence: dispute.evidences,
    });
    dispute.status = dispute.aiAnalysis.sendToAdmin ? 'UNDER_REVIEW' : 'RESOLVED';
    dispute.resolution = dispute.aiAnalysis.recommendedDecision;
    dispute.updatedAt = new Date();
    void this.auditDispute('DISPUTE_EVIDENCE_AI_REANALYZED_MEMORY', dispute, {
      evidence,
      analysis: dispute.aiAnalysis,
    });

    return dispute;
  }

  private async tryPersistDispute(
    data: any,
    analysis: DisputeAutomationAnalysis,
  ) {
    const orderId = this.readString(data?.orderId ?? data?.serviceOrderId);
    const clientId = this.readString(data?.clientId);
    const reason = this.readString(data?.reason) ?? 'Disputa aberta';

    if (!orderId || !clientId) {
      return null;
    }

    try {
      return await this.prisma.dispute.upsert({
        where: { serviceOrderId: orderId },
        create: {
          serviceOrderId: orderId,
          clientId,
          professionalId: this.readString(data?.professionalId),
          reason,
          status: analysis.sendToAdmin ? 'UNDER_REVIEW' : 'RESOLVED',
          resolution: analysis.recommendedDecision,
          resolvedAt: analysis.sendToAdmin ? null : new Date(),
          aiScore: analysis.score,
          aiDecision: analysis.recommendedDecision,
          aiReason: analysis.reason,
          aiRiskLevel: analysis.riskLevel,
          aiReleasePayment: analysis.releasePayment,
          aiBlockPayment: analysis.blockPayment,
          aiSendToAdmin: analysis.sendToAdmin,
          adminReviewRequired: analysis.adminReviewRequired,
          aiEvidence: this.stringifyJson(analysis.evidence),
        },
        update: {
          clientId,
          professionalId: this.readString(data?.professionalId),
          reason,
          status: analysis.sendToAdmin ? 'UNDER_REVIEW' : 'RESOLVED',
          resolution: analysis.recommendedDecision,
          resolvedAt: analysis.sendToAdmin ? null : new Date(),
          aiScore: analysis.score,
          aiDecision: analysis.recommendedDecision,
          aiReason: analysis.reason,
          aiRiskLevel: analysis.riskLevel,
          aiReleasePayment: analysis.releasePayment,
          aiBlockPayment: analysis.blockPayment,
          aiSendToAdmin: analysis.sendToAdmin,
          adminReviewRequired: analysis.adminReviewRequired,
          aiEvidence: this.stringifyJson(analysis.evidence),
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
      aiScore: dispute.aiScore ?? dispute.aiAnalysis?.score,
      aiDecision: dispute.aiDecision ?? dispute.aiAnalysis?.recommendedDecision,
      aiRiskLevel: dispute.aiRiskLevel ?? dispute.aiAnalysis?.riskLevel,
      adminReviewRequired:
        dispute.adminReviewRequired ?? dispute.aiAnalysis?.adminReviewRequired,
      message: 'Disputa analisada automaticamente pela IA',
      timestamp:
        dispute.createdAt?.toISOString?.() ??
        dispute.createdAt ??
        new Date().toISOString(),
    };

    try {
      const { RealtimeGateway } = require('../realtime/realtime.gateway');
      RealtimeGateway.emitOperational('dispute-opened', payload);
      RealtimeGateway.emitOperational('dispute-ai-reviewed', payload);
    } catch {
      // RealtimeGateway may not be available
    }

    void this.pushRealService
      .notifyOrderEvent('DISPUTE_OPENED', payload)
      .catch(() => undefined);
  }

  private toPublicPrismaDispute(dispute: any) {
    const aiAnalysis = {
      score: Number(dispute.aiScore ?? 0),
      recommendedDecision: dispute.aiDecision,
      reason: dispute.aiReason,
      riskLevel: dispute.aiRiskLevel,
      releasePayment: Boolean(dispute.aiReleasePayment),
      blockPayment: Boolean(dispute.aiBlockPayment),
      sendToAdmin: Boolean(dispute.aiSendToAdmin),
      adminReviewRequired: Boolean(dispute.adminReviewRequired),
      evidence: this.parseJson(dispute.aiEvidence, {}),
      automationApplied: this.parseJson(dispute.automationApplied, null),
    };

    return {
      success: true,
      id: dispute.id,
      orderId: dispute.serviceOrderId,
      clientId: dispute.clientId,
      professionalId: dispute.professionalId,
      reason: dispute.reason,
      status: dispute.status,
      resolution: dispute.resolution,
      aiAnalysis,
      createdAt: dispute.createdAt,
      updatedAt: dispute.resolvedAt ?? dispute.createdAt,
    };
  }

  private async analyzeDispute(data: any): Promise<DisputeAutomationAnalysis> {
    const orderId = this.readString(data?.orderId ?? data?.serviceOrderId);
    const reason = this.readString(data?.reason) ?? 'Disputa aberta';
    const context = await this.collectContext(orderId);
    const payment = context.payments[0];
    const proofCount = context.proofs.length;
    const trackingCount = context.tracking.length;
    const checkInAt = context.order?.checkInAt ?? this.findTimeline(context, 'CHECKED_IN');
    const checkOutAt =
      context.order?.checkOutAt ?? this.findTimeline(context, 'CHECKED_OUT');
    const chatContactAttempts = this.countContactAttempts(
      context.chat.map((item: any) => item.message),
    );
    const voiceContactAttempts = this.countContactAttempts(
      context.voiceAudits.map((item: any) =>
        JSON.stringify(this.parseJson(item.metadata, {})),
      ),
    );
    const negotiationTexts = this.negotiationTexts(context.negotiation);
    const negotiationContactAttempts = this.countContactAttempts(negotiationTexts);
    const extraEvidence = Array.isArray(data?.extraEvidence)
      ? data.extraEvidence
      : [];
    const evidenceContactAttempts = this.countContactAttempts(
      extraEvidence.map((item: any) =>
        `${item?.message ?? ''} ${item?.voiceTranscript ?? ''}`,
      ),
    );
    const fraudRisk = await this.fraudService
      .analyzeDispute({
        orderId,
        clientId: data?.clientId ?? context.order?.clientId,
        professionalId: data?.professionalId ?? context.order?.professionalId,
        amount: payment?.amount ?? context.order?.price,
        proofCount,
        trackingCount,
        chatContactAttempts: chatContactAttempts + negotiationContactAttempts,
        voiceContactAttempts: voiceContactAttempts + evidenceContactAttempts,
        paymentStatus: payment?.status,
      })
      .catch(() => null);

    const missingPayment = !payment;
    const paymentProtected =
      payment &&
      ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(
        `${payment.status}`.toUpperCase(),
      );
    const gpsSpoofSignals = context.tracking.filter((event: any) => {
      const metadata = this.parseJson(event.metadata, {});
      return metadata?.mocked || metadata?.gpsSpoofed || metadata?.mockLocation;
    }).length;
    const professionalReputation = context.order?.professional?.reputationProfile;
    const professionalRating = Number(
      professionalReputation?.averageRating ?? context.negotiation?.rating ?? 5,
    );
    const completedServices = Number(
      professionalReputation?.completedServices ?? 0,
    );
    const cancelledServices = Number(
      professionalReputation?.cancelledServices ?? 0,
    );
    const complaintText = this.normalize(
      [
        reason,
        ...extraEvidence.map((item: any) => item?.message),
        ...context.chat.map((item: any) => item.message),
      ].join(' '),
    );

    let score = 8;

    if (!context.order) score += 45;
    if (missingPayment) score += 30;
    if (payment && !paymentProtected) score += 18;
    if (!checkInAt) score += 18;
    if (!checkOutAt) score += 20;
    if (proofCount === 0) score += 20;
    if (trackingCount === 0) score += 14;
    if (gpsSpoofSignals > 0) score += 35;
    if (
      chatContactAttempts +
        voiceContactAttempts +
        negotiationContactAttempts +
        evidenceContactAttempts >
      0
    ) {
      score += 30;
    }
    if (this.containsAny(complaintText, ['golpe', 'ameaca', 'ameaça', 'roubo'])) {
      score += 30;
    }
    if (
      this.containsAny(complaintText, ['nao veio', 'não veio', 'nao apareceu']) &&
      checkInAt
    ) {
      score += 14;
    }
    if (professionalRating < 3.5) score += 14;
    if (cancelledServices > completedServices && cancelledServices > 2) score += 10;
    if (fraudRisk?.riskScore) score += Math.min(35, Number(fraudRisk.riskScore) * 0.35);

    if (paymentProtected) score -= 8;
    if (checkInAt && checkOutAt) score -= 12;
    if (proofCount >= 2) score -= 10;
    if (trackingCount >= 2) score -= 8;
    if (context.reviews.length > 0) score -= 4;

    score = this.clampScore(score);
    const riskLevel = this.riskLevel(score);
    const sendToAdmin = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
    const shouldBlock =
      !sendToAdmin &&
      (!paymentProtected ||
        (!checkOutAt &&
          this.containsAny(complaintText, [
            'nao terminou',
            'não terminou',
            'incompleto',
            'defeito',
            'mal feito',
          ])));
    const recommendedDecision: AiDisputeDecision = sendToAdmin
      ? 'ADMIN_REVIEW'
      : shouldBlock
        ? 'BLOCK_PAYMENT'
        : 'RELEASE_PAYMENT';
    const evidence = {
      gps: {
        trackingCount,
        spoofSignals: gpsSpoofSignals,
        last: context.tracking[0] ?? null,
      },
      checkIn: { present: Boolean(checkInAt), at: checkInAt },
      checkOut: { present: Boolean(checkOutAt), at: checkOutAt },
      proofs: context.proofs.map((proof: any) => ({
        id: proof.id,
        type: this.parseJson(proof.metadata, {})?.type ?? proof.visibility,
        fileUrl: proof.fileUrl,
        createdAt: proof.createdAt,
      })),
      voiceTranscriptions: context.voiceAudits.length,
      chatMessages: context.chat.length,
      proposal: context.negotiation?.quotes?.[0] ?? null,
      counterProposal: context.negotiation?.counterOffers?.[0] ?? null,
      finalOffer: context.negotiation?.finalOffers?.[0] ?? null,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            escrowStatus: payment.escrowStatus,
            amount: Number(payment.amount ?? 0),
          }
        : null,
      timeline: context.timeline.map((item: any) => ({
        type: item.type,
        title: item.title,
        state: item.state,
        timestamp: item.timestamp,
      })),
      reputation: {
        professionalRating,
        completedServices,
        cancelledServices,
      },
      history: {
        reviews: context.reviews.length,
        paymentAudits: context.paymentAudits.length,
      },
      antifraud: fraudRisk,
      contactAttempts: {
        chat: chatContactAttempts,
        voice: voiceContactAttempts,
        negotiation: negotiationContactAttempts,
        evidence: evidenceContactAttempts,
      },
      extraEvidence,
    };

    return {
      score,
      recommendedDecision,
      reason: this.decisionReason({
        score,
        riskLevel,
        recommendedDecision,
        paymentProtected: Boolean(paymentProtected),
        checkInAt,
        checkOutAt,
        proofCount,
        contactAttempts:
          chatContactAttempts +
          voiceContactAttempts +
          negotiationContactAttempts +
          evidenceContactAttempts,
      }),
      riskLevel,
      releasePayment: recommendedDecision === 'RELEASE_PAYMENT',
      blockPayment:
        recommendedDecision === 'BLOCK_PAYMENT' ||
        recommendedDecision === 'ADMIN_REVIEW',
      sendToAdmin,
      adminReviewRequired: sendToAdmin,
      evidence,
      fraudRisk,
    };
  }

  private async collectContext(orderId?: string) {
    if (!orderId) {
      return {
        order: null,
        payments: [],
        proofs: [],
        chat: [],
        tracking: [],
        timeline: [],
        reviews: [],
        paymentAudits: [],
        voiceAudits: [],
        negotiation: null,
      };
    }

    const [
      order,
      paymentAudits,
      voiceAudits,
      negotiation,
    ] = await Promise.all([
      this.prisma.serviceOrder
        .findUnique({
          where: { id: orderId },
          include: {
            escrow: true,
            payments: {
              orderBy: { createdAt: 'desc' },
              include: { audits: { orderBy: { createdAt: 'desc' }, take: 30 } },
            },
            proofUploads: { orderBy: { createdAt: 'desc' }, take: 40 },
            chatMessages: { orderBy: { createdAt: 'asc' }, take: 120 },
            trackingEvents: { orderBy: { timestamp: 'desc' }, take: 80 },
            timelineEvents: { orderBy: { timestamp: 'asc' }, take: 80 },
            reviews: true,
            professional: { include: { reputationProfile: true } },
            client: { include: { reputationProfile: true } },
          },
        })
        .catch(() => null),
      this.prisma.paymentAudit
        .findMany({
          where: { orderId },
          orderBy: { createdAt: 'desc' },
          take: 120,
        })
        .catch(() => []),
      this.prisma.paymentAudit
        .findMany({
          where: {
            orderId,
            action: { startsWith: 'VOICE_' },
          },
          orderBy: { createdAt: 'desc' },
          take: 60,
        })
        .catch(() => []),
      this.prisma.negotiation
        .findFirst({
          where: { acceptedOrderId: orderId },
          include: {
            request: true,
            quotes: { orderBy: { createdAt: 'desc' }, take: 5 },
            counterOffers: { orderBy: { createdAt: 'desc' }, take: 5 },
            finalOffers: { orderBy: { createdAt: 'desc' }, take: 5 },
            events: { orderBy: { createdAt: 'asc' }, take: 80 },
          },
        })
        .catch(() => null),
    ]);

    return {
      order,
      payments: order?.payments ?? [],
      proofs: order?.proofUploads ?? [],
      chat: order?.chatMessages ?? [],
      tracking: order?.trackingEvents ?? [],
      timeline: order?.timelineEvents ?? [],
      reviews: order?.reviews ?? [],
      paymentAudits,
      voiceAudits,
      negotiation,
    };
  }

  private async applyAutomatedPaymentDecision(
    orderId: string,
    analysis: DisputeAutomationAnalysis,
  ) {
    if (analysis.sendToAdmin) {
      return {
        applied: false,
        action: 'ADMIN_REVIEW_REQUIRED',
        reason: analysis.reason,
      };
    }

    if (analysis.releasePayment) {
      try {
        const release = await this.paymentsService.releaseForOrder(orderId);

        return {
          applied: true,
          action: 'PAYMENT_RELEASED',
          release,
        };
      } catch (error) {
        return {
          applied: false,
          action: 'PAYMENT_RELEASE_PENDING',
          error: error instanceof Error ? error.message : `${error}`,
        };
      }
    }

    await this.auditService.register('DISPUTE_PAYMENT_BLOCKED_BY_AI', {
      action: 'DISPUTE_PAYMENT_BLOCKED_BY_AI',
      orderId,
      status: analysis.riskLevel,
      details: analysis,
    });

    return {
      applied: true,
      action: 'PAYMENT_BLOCKED',
      reason: analysis.reason,
    };
  }

  private decisionReason(input: {
    score: number;
    riskLevel: AiRiskLevel;
    recommendedDecision: AiDisputeDecision;
    paymentProtected: boolean;
    checkInAt?: any;
    checkOutAt?: any;
    proofCount: number;
    contactAttempts: number;
  }) {
    const facts = [
      `score ${input.score}`,
      `risco ${input.riskLevel}`,
      input.paymentProtected ? 'pagamento protegido encontrado' : 'pagamento protegido ausente',
      input.checkInAt ? 'check-in encontrado' : 'check-in ausente',
      input.checkOutAt ? 'check-out encontrado' : 'check-out ausente',
      `${input.proofCount} prova(s)`,
      `${input.contactAttempts} tentativa(s) de contato externo`,
    ];

    if (input.recommendedDecision === 'ADMIN_REVIEW') {
      return `Caso HIGH RISK enviado para admin: ${facts.join(', ')}.`;
    }

    if (input.recommendedDecision === 'BLOCK_PAYMENT') {
      return `IA bloqueou liberacao automatica: ${facts.join(', ')}.`;
    }

    return `IA recomendou liberar pagamento: ${facts.join(', ')}.`;
  }

  private findTimeline(context: any, type: string) {
    const event = context.timeline.find((item: any) => item.type === type);

    return event?.timestamp ?? null;
  }

  private countContactAttempts(values: unknown[]): number {
    return values.reduce<number>((total, value) => {
      const filter = filterDirectContact(value);

      return total + (filter.blocked ? 1 : 0);
    }, 0);
  }

  private negotiationTexts(negotiation: any) {
    if (!negotiation) {
      return [];
    }

    return [
      negotiation.request?.title,
      negotiation.request?.description,
      negotiation.request?.observations,
      negotiation.request?.aiBriefing,
      ...(negotiation.quotes ?? []).flatMap((item: any) => [
        item.notes,
        item.includes,
        item.excludes,
        item.deadline,
      ]),
      ...(negotiation.counterOffers ?? []).map((item: any) => item.message),
      ...(negotiation.finalOffers ?? []).flatMap((item: any) => [
        item.message,
        item.deadline,
      ]),
      ...(negotiation.events ?? []).flatMap((item: any) => [
        item.message,
        item.metadata,
      ]),
    ].filter(Boolean);
  }

  private riskLevel(score: number): AiRiskLevel {
    if (score >= 90) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  private clampScore(score: number) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private async auditDispute(action: string, dispute: any, details?: any) {
    await this.auditService.register(action, {
      action,
      userId: this.readString(dispute.clientId),
      orderId: this.readString(dispute.orderId ?? dispute.serviceOrderId),
      status: this.readString(dispute.status),
      details: {
        status: dispute.status,
        professionalId: dispute.professionalId,
        reason: dispute.reason,
        resolution: dispute.resolution,
        aiAnalysis: dispute.aiAnalysis,
        ...details,
      },
    });
  }

  private async ensureSchema() {
    this.schemaReady ??= this.createSchema();
    return this.schemaReady;
  }

  private async createSchema() {
    const statements = [
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiScore" DOUBLE PRECISION`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiDecision" TEXT`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiReason" TEXT`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiRiskLevel" TEXT`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiReleasePayment" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiBlockPayment" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiSendToAdmin" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "adminReviewRequired" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "aiEvidence" TEXT`,
      `ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "automationApplied" TEXT`,
      `CREATE INDEX IF NOT EXISTS "Dispute_aiRiskLevel_idx" ON "Dispute"("aiRiskLevel")`,
      `CREATE INDEX IF NOT EXISTS "Dispute_adminReviewRequired_idx" ON "Dispute"("adminReviewRequired")`,
    ];

    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement).catch(() => undefined);
    }
  }

  private stringifyJson(value: any) {
    try {
      return JSON.stringify(value ?? null);
    } catch {
      return null;
    }
  }

  private parseJson(value: any, fallback: any) {
    if (value == null || value === '') {
      return fallback;
    }

    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private normalize(value: unknown) {
    return `${value ?? ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private containsAny(text: string, tokens: string[]) {
    return tokens.some((token) => text.includes(this.normalize(token)));
  }
}






