import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

type AiDisputeDecision =
  | 'RELEASE_TO_PROFESSIONAL'
  | 'FULL_REFUND_TO_CLIENT'
  | 'ADMIN_REVIEW';

interface ScoreEvidence {
  key: string;
  label: string;
  points: number;
  found: boolean;
  weight: 'HIGH' | 'MEDIUM' | 'COMPLEMENTARY';
  details?: Record<string, unknown>;
}

@Injectable()
export class FinanceEnterpriseService {
  private readonly logger = new Logger(FinanceEnterpriseService.name);
  private readonly platformCommissionRate = 0.10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly walletService: WalletService,
  ) {}

  health(): Record<string, unknown> {
    return {
      status: 'ok',
      module: 'finance-enterprise',
      split: {
        platformPercent: 10,
        professionalPercent: 90,
      },
      refundRule: {
        clientWinsDispute: '100% cliente, 0% BoraServico, 0% profissional',
      },
      escrowReleaseRule:
        'Cliente precisa confirmar conclusao do servico para liberar pagamento, exceto decisao automatica de disputa IA com alta confianca.',
      aiDisputeEngine: {
        automaticDecisionThreshold: 95,
        aiRecommendationThreshold: 80,
        adminReviewBelow: 80,
      },
      productionReady: false,
    };
  }

  async getOrderFinancialSummary(orderId: string): Promise<any> {
    const order = await this.requireOrder(orderId);
    const payment = await this.findLatestPayment(orderId);
    const escrow = await this.findEscrow(orderId);
    const dispute = await this.prisma.dispute.findUnique({
      where: { serviceOrderId: orderId },
    }).catch(() => null);

    return {
      success: true,
      orderId,
      orderStatus: order.status,
      clientId: order.clientId,
      professionalId: order.professionalId,
      payment: payment ? this.publicPayment(payment) : null,
      escrow: escrow
        ? {
            id: escrow.id,
            amount: Number(escrow.amount),
            status: escrow.status,
            releasedAt: escrow.releasedAt,
          }
        : null,
      dispute: dispute
        ? {
            id: dispute.id,
            status: dispute.status,
            aiScore: dispute.aiScore,
            aiDecision: dispute.aiDecision,
            adminReviewRequired: dispute.adminReviewRequired,
            automationApplied: dispute.automationApplied,
          }
        : null,
      splitRule: this.calculateSplit(Number(payment?.amount ?? order.price ?? 0)),
      refundRule: {
        clientWins: {
          clientRefundPercent: 100,
          platformFee: 0,
          professionalAmount: 0,
        },
      },
    };
  }

  async markWaitingClientConfirmation(orderId: string, input: any = {}): Promise<any> {
    const order = await this.requireOrder(orderId);

    await this.prisma.serviceOrder.update({
      where: { id: orderId },
      data: {
        status: 'WAITING_CLIENT_CONFIRMATION',
        checkOutAt: order.checkOutAt ?? new Date(),
      },
    });

    await this.writePaymentAudit({
      orderId,
      action: 'WAITING_CLIENT_CONFIRMATION',
      status: 'WAITING_CLIENT_CONFIRMATION',
      amount: Number(order.price ?? 0),
      metadata: {
        actorId: input.actorId,
        source: input.source ?? 'CHECK_OUT',
        message:
          'Servico aguardando confirmacao do cliente para liberar escrow.',
      },
    });

    return {
      success: true,
      orderId,
      status: 'WAITING_CLIENT_CONFIRMATION',
      message: 'Cliente precisa confirmar o servico concluido para liberar escrow.',
    };
  }

  async clientConfirmServiceCompleted(orderId: string, input: any = {}): Promise<any> {
    const order = await this.requireOrder(orderId);

    if (order.clientId && input.clientId && order.clientId !== input.clientId && input.bypassClientConfirmation !== true) {
      throw new BadRequestException('Apenas o cliente da ordem pode confirmar conclusao.');
    }

    const payment = await this.findLatestPayment(orderId);
    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado para liberar escrow.');
    }

    if (payment.status === 'REFUNDED') {
      throw new BadRequestException('Pagamento ja foi reembolsado e nao pode ser liberado.');
    }

    const amount = Number(payment.amount ?? order.price ?? 0);
    const split = this.calculateSplit(amount);

    if (order.professionalId) {
      await this.ensureWallet(order.professionalId);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        commission: split.platformAmount,
        escrowStatus: 'HELD',
        metadata: this.mergeMetadata(payment.metadata, {
          split,
          clientConfirmedAt: new Date().toISOString(),
          clientConfirmationRequired: true,
          releaseSource: input.source ?? 'CLIENT_CONFIRMATION',
        }),
      },
    });

    const releaseResult =
      payment.status === 'RELEASED'
        ? {
            success: true,
            paymentId: payment.id,
            status: 'RELEASED',
            amount,
            commission: split.platformAmount,
            professionalAmount: split.professionalAmount,
            alreadyReleased: true,
          }
        : await this.paymentsService.releasePayment(payment.id);

    await this.prisma.escrow.updateMany({
      where: { serviceOrderId: orderId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });

    await this.prisma.serviceOrder.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    await this.writePaymentAudit({
      paymentId: payment.id,
      orderId,
      action: 'CLIENT_CONFIRMED_SERVICE_COMPLETED',
      status: 'ESCROW_RELEASED',
      amount,
      metadata: {
        ...split,
        clientId: input.clientId,
        source: input.source ?? 'CLIENT_CONFIRMATION',
        releaseResult,
      },
    });

    return {
      success: true,
      orderId,
      paymentId: payment.id,
      status: 'ESCROW_RELEASED',
      split,
      releaseResult,
      message: 'Escrow liberado: 10% BoraServico e 90% profissional.',
    };
  }

  async openFinancialDispute(orderId: string, input: any = {}): Promise<any> {
    const order = await this.requireOrder(orderId);
    const reason = this.safeString(input.reason) ?? 'Disputa financeira aberta pelo app';

    const dispute = await this.prisma.dispute.upsert({
      where: { serviceOrderId: orderId },
      create: {
        serviceOrderId: orderId,
        clientId: order.clientId,
        professionalId: order.professionalId,
        reason,
        status: 'OPEN',
        adminReviewRequired: false,
        aiSendToAdmin: false,
        aiEvidence: JSON.stringify({
          openedBy: input.actorId,
          openedAt: new Date().toISOString(),
          source: input.source ?? 'FINANCE_ENTERPRISE',
        }),
      },
      update: {
        reason,
        status: 'OPEN',
        resolvedAt: null,
        adminReviewRequired: false,
        aiSendToAdmin: false,
        automationApplied: null,
      },
    });

    await this.prisma.payment.updateMany({
      where: { orderId, status: { notIn: ['REFUNDED', 'RELEASED'] } },
      data: {
        escrowStatus: 'DISPUTED',
      },
    });

    await this.writePaymentAudit({
      orderId,
      action: 'FINANCIAL_DISPUTE_OPENED',
      status: 'DISPUTED',
      amount: Number(order.price ?? 0),
      metadata: {
        disputeId: dispute.id,
        reason,
        actorId: input.actorId,
      },
    });

    return {
      success: true,
      orderId,
      disputeId: dispute.id,
      status: 'OPEN',
      message: 'Disputa financeira aberta. Escrow bloqueado para analise da IA.',
    };
  }

  async aiResolveDispute(disputeId: string, input: any = {}): Promise<any> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { serviceOrder: true },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa nao encontrada');
    }

    const analysis = await this.analyzeDisputeEvidence(dispute);
    const shouldApplyAutomatically = analysis.confidence >= 95 || input.forceAutomation === true;
    let automationResult: any = null;

    if (shouldApplyAutomatically && analysis.decision === 'RELEASE_TO_PROFESSIONAL') {
      automationResult = await this.clientConfirmServiceCompleted(dispute.serviceOrderId, {
        source: 'AI_DISPUTE_ENGINE',
        bypassClientConfirmation: true,
      });
    }

    if (shouldApplyAutomatically && analysis.decision === 'FULL_REFUND_TO_CLIENT') {
      automationResult = await this.refundFullToClient(dispute.serviceOrderId, {
        source: 'AI_DISPUTE_ENGINE',
        disputeId: dispute.id,
      });
    }

    const status = shouldApplyAutomatically ? 'RESOLVED' : 'AI_RECOMMENDED';
    await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status,
        resolution: analysis.resolution,
        aiScore: analysis.confidence,
        aiDecision: analysis.decision,
        aiReason: analysis.reason,
        aiRiskLevel: analysis.riskLevel,
        aiReleasePayment: analysis.decision === 'RELEASE_TO_PROFESSIONAL',
        aiBlockPayment: analysis.decision === 'FULL_REFUND_TO_CLIENT',
        aiSendToAdmin: analysis.decision === 'ADMIN_REVIEW',
        adminReviewRequired: analysis.decision === 'ADMIN_REVIEW',
        aiEvidence: JSON.stringify(analysis),
        automationApplied: shouldApplyAutomatically ? analysis.decision : 'AI_RECOMMENDATION_ONLY',
        resolvedAt: shouldApplyAutomatically ? new Date() : null,
      },
    });

    await this.writePaymentAudit({
      orderId: dispute.serviceOrderId,
      action: shouldApplyAutomatically
        ? 'AI_DISPUTE_DECISION_APPLIED'
        : 'AI_DISPUTE_RECOMMENDATION_CREATED',
      status,
      amount: Number(dispute.serviceOrder?.price ?? 0),
      metadata: {
        disputeId: dispute.id,
        decision: analysis.decision,
        confidence: analysis.confidence,
        automationResult,
      },
    });

    return {
      success: true,
      disputeId: dispute.id,
      orderId: dispute.serviceOrderId,
      analysis,
      automationApplied: shouldApplyAutomatically,
      automationResult,
    };
  }

  async requestPixWithdrawal(input: any): Promise<any> {
    return this.walletService.withdrawPix({
      ...input,
      source: 'PIX',
      metadata: {
        ...(input.metadata ?? {}),
        requestedVia: 'FINANCE_ENTERPRISE',
        requestedAt: new Date().toISOString(),
      },
    });
  }

  private async refundFullToClient(orderId: string, input: any = {}): Promise<any> {
    const order = await this.requireOrder(orderId);
    const payment = await this.findLatestPayment(orderId);

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado para reembolso');
    }

    if (payment.status === 'RELEASED') {
      throw new BadRequestException('Pagamento ja foi liberado ao profissional.');
    }

    const amount = Number(payment.amount ?? order.price ?? 0);

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        commission: 0,
        escrowStatus: 'HELD',
        metadata: this.mergeMetadata(payment.metadata, {
          refundRule: 'FULL_CLIENT_REFUND_NO_PLATFORM_FEE',
          platformFee: 0,
          professionalAmount: 0,
          refundSource: input.source ?? 'FINANCE_ENTERPRISE',
        }),
      },
    });

    const refundResult =
      payment.status === 'REFUNDED'
        ? {
            success: true,
            paymentId: payment.id,
            status: 'REFUNDED',
            amount,
            alreadyRefunded: true,
          }
        : await this.paymentsService.refundPayment(payment.id);

    await this.prisma.escrow.updateMany({
      where: { serviceOrderId: orderId },
      data: {
        status: 'REFUNDED',
      },
    });

    await this.prisma.serviceOrder.update({
      where: { id: orderId },
      data: {
        status: 'DISPUTE_RESOLVED_CLIENT_REFUND',
      },
    });

    await this.writePaymentAudit({
      paymentId: payment.id,
      orderId,
      action: 'FULL_CLIENT_REFUND_NO_PLATFORM_FEE',
      status: 'REFUNDED',
      amount,
      metadata: {
        disputeId: input.disputeId,
        platformFee: 0,
        professionalAmount: 0,
        clientRefundAmount: amount,
        refundResult,
      },
    });

    return {
      success: true,
      orderId,
      paymentId: payment.id,
      status: 'REFUNDED',
      clientRefundAmount: amount,
      platformFee: 0,
      professionalAmount: 0,
      refundResult,
    };
  }

  private async analyzeDisputeEvidence(dispute: any): Promise<any> {
    const orderId = dispute.serviceOrderId;
    const order = dispute.serviceOrder;
    const [
      trackingEvents,
      timelineEvents,
      proofs,
      chatMessages,
      reviews,
      reputation,
      payments,
    ] = await Promise.all([
      this.prisma.trackingEvent.findMany({
        where: { orderId },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }).catch(() => []),
      this.prisma.operationalTimelineEvent.findMany({
        where: { orderId },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }).catch(() => []),
      this.prisma.proofUpload.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }).catch(() => []),
      this.prisma.chatMessage.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }).catch(() => []),
      this.prisma.review.findMany({
        where: { orderId },
        take: 20,
      }).catch(() => []),
      order?.professionalId
        ? this.prisma.reputationProfile.findUnique({
            where: { userId: order.professionalId },
          }).catch(() => null)
        : Promise.resolve(null),
      this.prisma.payment.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }).catch(() => []),
    ]);

    const evidence: ScoreEvidence[] = [
      {
        key: 'GPS_TRACKING',
        label: 'GPS/tracking registrado',
        points: 18,
        found: trackingEvents.length > 0,
        weight: 'HIGH',
        details: { count: trackingEvents.length },
      },
      {
        key: 'CHECK_IN',
        label: 'Check-in registrado',
        points: 17,
        found:
          Boolean(order?.checkInAt) ||
          trackingEvents.some((event: any) =>
            this.includesAny(event.status, ['CHECKED_IN', 'CHECK_IN']),
          ) ||
          timelineEvents.some((event: any) =>
            this.includesAny(event.type, ['CHECKED_IN', 'CHECK_IN']),
          ),
        weight: 'HIGH',
      },
      {
        key: 'CHECK_OUT',
        label: 'Check-out registrado',
        points: 17,
        found:
          Boolean(order?.checkOutAt) ||
          trackingEvents.some((event: any) =>
            this.includesAny(event.status, ['CHECKED_OUT', 'CHECK_OUT']),
          ) ||
          timelineEvents.some((event: any) =>
            this.includesAny(event.type, ['CHECKED_OUT', 'CHECK_OUT']),
          ),
        weight: 'HIGH',
      },
      {
        key: 'PHOTO_PROOF',
        label: 'Fotos/provas anexadas',
        points: 14,
        found: proofs.length > 0,
        weight: 'MEDIUM',
        details: { count: proofs.length },
      },
      {
        key: 'OCR_METADATA',
        label: 'OCR/metadados de prova',
        points: 8,
        found: proofs.some((proof: any) =>
          this.includesAny(proof.metadata, ['ocr', 'safe', 'vision', 'fraud']),
        ),
        weight: 'MEDIUM',
      },
      {
        key: 'TIMELINE',
        label: 'Timeline operacional consistente',
        points: 10,
        found: timelineEvents.length >= 2,
        weight: 'MEDIUM',
        details: { count: timelineEvents.length },
      },
      {
        key: 'CHAT',
        label: 'Chat registrado',
        points: 4,
        found: chatMessages.length > 0,
        weight: 'COMPLEMENTARY',
        details: { count: chatMessages.length },
      },
      {
        key: 'VOICE',
        label: 'Voz transcrita ou indicio de comando por voz',
        points: 3,
        found: chatMessages.some((message: any) =>
          this.includesAny(message.message, ['voz', 'audio', 'transcricao', 'voice']),
        ),
        weight: 'COMPLEMENTARY',
      },
      {
        key: 'REPUTATION',
        label: 'Reputacao profissional positiva',
        points: 4,
        found: Number(reputation?.reputationScore ?? 0) >= 80,
        weight: 'COMPLEMENTARY',
        details: reputation
          ? {
              reputationScore: reputation.reputationScore,
              averageRating: reputation.averageRating,
              completedServices: reputation.completedServices,
            }
          : undefined,
      },
      {
        key: 'HISTORY',
        label: 'Historico do pedido/reviews disponivel',
        points: 2,
        found: reviews.length > 0 || payments.length > 0,
        weight: 'COMPLEMENTARY',
      },
      {
        key: 'ANTI_FRAUD',
        label: 'Sem indicio textual forte de fraude contra profissional',
        points: 3,
        found: !this.includesAny(dispute.reason, [
          'golpe',
          'fraude',
          'nao apareceu',
          'nao foi',
          'sem servico',
          'nao realizou',
        ]),
        weight: 'COMPLEMENTARY',
      },
    ];

    const professionalScore = evidence
      .filter((item) => item.found)
      .reduce((total, item) => total + item.points, 0);

    const clientSignals = [
      !evidence.find((item) => item.key === 'GPS_TRACKING')?.found,
      !evidence.find((item) => item.key === 'CHECK_IN')?.found,
      !evidence.find((item) => item.key === 'CHECK_OUT')?.found,
      !evidence.find((item) => item.key === 'PHOTO_PROOF')?.found,
      this.includesAny(dispute.reason, [
        'nao apareceu',
        'nao foi',
        'sem servico',
        'nao realizou',
        'servico incompleto',
        'abandono',
      ]),
    ].filter(Boolean).length;

    const clientScore = Math.min(100, clientSignals * 22);
    const confidence = Math.max(professionalScore, clientScore);
    let decision: AiDisputeDecision = 'ADMIN_REVIEW';
    let resolution = 'ADMIN_REVIEW_REQUIRED';
    let reason =
      'Evidencias insuficientes para decisao automatica. Encaminhar ao admin.';

    if (professionalScore >= 95) {
      decision = 'RELEASE_TO_PROFESSIONAL';
      resolution = 'PROFESSIONAL_FAVORED_BY_EVIDENCE';
      reason =
        'GPS, check-in, check-out, provas e evidencias complementares sustentam liberacao ao profissional.';
    } else if (clientScore >= 95) {
      decision = 'FULL_REFUND_TO_CLIENT';
      resolution = 'CLIENT_FAVORED_FULL_REFUND';
      reason =
        'Ausencia ou contradicao forte de GPS/check-in/check-out/provas sustenta reembolso integral ao cliente sem taxa do app.';
    } else if (professionalScore >= 80 && professionalScore > clientScore) {
      decision = 'ADMIN_REVIEW';
      resolution = 'AI_RECOMMENDS_PROFESSIONAL';
      reason =
        'IA recomenda profissional, mas confianca abaixo de 95 exige revisao.';
    } else if (clientScore >= 80 && clientScore > professionalScore) {
      decision = 'ADMIN_REVIEW';
      resolution = 'AI_RECOMMENDS_CLIENT_REFUND';
      reason =
        'IA recomenda cliente, mas confianca abaixo de 95 exige revisao.';
    }

    return {
      orderId,
      disputeId: dispute.id,
      confidence,
      professionalScore,
      clientScore,
      decision,
      resolution,
      reason,
      riskLevel: confidence >= 95 ? 'LOW_AMBIGUITY' : confidence >= 80 ? 'MEDIUM_AMBIGUITY' : 'HIGH_AMBIGUITY',
      thresholds: {
        automatic: 95,
        recommendation: 80,
      },
      evidence,
      rules: {
        normalCompletion: '90% profissional, 10% BoraServico',
        clientWinsDispute: '100% cliente, 0% BoraServico, 0% profissional',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async requireOrder(orderId: string): Promise<any> {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Ordem nao encontrada');
    }

    return order;
  }

  private async findLatestPayment(orderId: string): Promise<any> {
    return this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findEscrow(orderId: string): Promise<any> {
    return this.prisma.escrow.findUnique({
      where: { serviceOrderId: orderId },
    }).catch(() => null);
  }

  private async ensureWallet(userId: string): Promise<any> {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: {
        userId,
        balance: 0,
        availableBalance: 0,
        escrowBalance: 0,
      },
      update: {},
    });
  }

  private calculateSplit(amount: number): any {
    const safeAmount = this.roundCurrency(amount);
    const platformAmount = this.roundCurrency(safeAmount * this.platformCommissionRate);
    const professionalAmount = this.roundCurrency(safeAmount - platformAmount);

    return {
      grossAmount: safeAmount,
      platformPercent: 10,
      professionalPercent: 90,
      platformAmount,
      professionalAmount,
    };
  }

  private async writePaymentAudit(input: {
    paymentId?: string;
    orderId?: string;
    action: string;
    status?: string;
    amount?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.paymentAudit.create({
      data: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        action: input.action,
        status: input.status,
        amount: input.amount,
        metadata: JSON.stringify({
          ...(input.metadata ?? {}),
          createdBy: 'FINANCE_ENTERPRISE',
          createdAt: new Date().toISOString(),
        }),
      },
    }).catch((error: any) => {
      this.logger.warn(`Falha ao registrar auditoria financeira: ${error?.message ?? error}`);
    });
  }

  private publicPayment(payment: any): any {
    return {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      escrowStatus: payment.escrowStatus,
      amount: Number(payment.amount),
      commission: Number(payment.commission),
      professionalAmount: this.roundCurrency(Number(payment.amount) - Number(payment.commission)),
      provider: payment.provider,
      paidAt: payment.paidAt,
      releasedAt: payment.releasedAt,
      refundedAt: payment.refundedAt,
    };
  }

  private mergeMetadata(current: any, next: Record<string, unknown>): string {
    return JSON.stringify({
      ...this.readMetadata(current),
      ...next,
      updatedAt: new Date().toISOString(),
    });
  }

  private readMetadata(value: any): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return { raw: String(value) };
    }
  }

  private safeString(value: any): string | undefined {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }

  private includesAny(value: any, patterns: string[]): boolean {
    const text = value === undefined || value === null ? '' : String(value).toLowerCase();
    return patterns.some((pattern) => text.includes(pattern.toLowerCase()));
  }

  private roundCurrency(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }
}
