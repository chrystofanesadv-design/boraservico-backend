import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FraudService } from '../fraud/fraud.service';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../security/audit.service';
import { getPlatformCommissionRate } from '../config/env';
import { MatchingService } from '../matching/matching.service';
import {
  containsOperationalResidue,
  filterDirectContact,
  repairLegacyEncoding,
  validatePhotoSafety,
} from '../security/contact-filter';

type OrderStatus =
  | 'CREATED'
  | 'MATCHING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'CANCELLED';

type MediatedProposalStatus =
  | 'PENDING'
  | 'NEGOTIATING'
  | 'PROFESSIONAL_ACCEPTED'
  | 'CLIENT_ACCEPTED'
  | 'AGREEMENT_CLOSED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'DETAILS_REQUESTED';

interface MediatedProposal {
  id: string;
  orderId: string;
  professionalId: string;
  professionalName: string;
  specialty: string;
  rating: number;
  amount: number;
  deadline: string;
  note: string;
  includes?: string;
  excludes?: string;
  observation?: string;
  availability?: string;
  materialIncluded?: boolean;
  etaMinutes: number;
  summary: string;
  visibleBadges: string[];
  conversionMessage: string;
  expiresAt: Date;
  status: MediatedProposalStatus;
  createdAt: Date;
  clientAcceptedAt?: Date;
  professionalAcceptedAt?: Date;
  agreementAt?: Date;
  negotiationRound?: number;
  maxNegotiationRounds?: number;
  finalRound?: boolean;
  lastActor?: string;
}

interface OperationalOrder {
  id: string;
  serviceId: number;
  clientId?: string;
  professionalId?: string;
  professionalName?: string;
  clientName?: string;
  clientEmail?: string;
  professionalEmail?: string;
  paymentConfirmed?: boolean;
  protectedPaymentStatus?: string;
  escrowStatus?: string;
  title: string;
  description: string;
  category?: string;
  address?: string;
  estimatedPrice: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  startedAt?: Date;
  checkInAt?: Date;
  checkOutAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, OperationalOrder>();
  private readonly proposals = new Map<string, MediatedProposal[]>();
  private readonly paymentConfirmedOrders = new Set<string>();
  private readonly platformCommissionRate = getPlatformCommissionRate();

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly pushRealService: PushRealService,
    private readonly fraudService: FraudService,
    private readonly timelineService: TimelineService,
    private readonly auditService: AuditService,
    private readonly matchingService: MatchingService,
  ) {}

  filterContactMessage(message: any) {
    const result = filterDirectContact(message);

    return {
      success: !result.blocked,
      ...result,
      policy: 'Contato externo só é liberado após pagamento protegido.',
      professionalPenaltyPolicy: {
        phase1: '1 aviso; 2ª tentativa = suspensão de 3 dias',
        phase2: '1 aviso; 2ª tentativa = suspensão de 10 dias',
        phase3: '1 aviso final; 2ª tentativa = bloqueio definitivo',
      },
      auditFields: [
        'dataHora',
        'tipo',
        'orderId',
        'professionalId',
        'conteudoMascarado',
        'resultadoOCR',
        'fase',
        'tentativa',
        'acaoAplicada',
      ],
    };
  }

  validatePhotoAttachment(body: any) {
    const safety = validatePhotoSafety({
      filename: body?.filename ?? body?.originalName,
      mimetype: body?.mimetype ?? body?.contentType,
      metadata: body?.metadata,
    });

    return {
      success: safety.allowed,
      ...safety,
      phase: safety.allowed ? 'fase-1-aviso' : 'fase-1-bloqueio',
      visionReady: true,
      ocrConfigured: false,
      auditRequired: true,
      professionalPenaltyPolicy: {
        phase1: '1 aviso; 2ª tentativa = suspensão de 3 dias',
        phase2: '1 aviso; 2ª tentativa = suspensão de 10 dias',
        phase3: '1 aviso final; 2ª tentativa = bloqueio definitivo',
      },
      pendingProductionAnalysis: [
        'telefone em imagem',
        'endereço completo',
        'e-mail',
        'Instagram/TikTok/Facebook/Telegram',
        'QR/WhatsApp',
        'link externo',
        'texto sensível',
      ],
    };
  }

  async create(data: any) {
    const persisted = await this.tryCreatePersistedOrder(data);

    if (persisted) {
      this.emitOrderEvent(persisted, 'order-event', 'Ordem criada');
      this.emitStatus(persisted, 'order-status-updated', 'CREATED');
      this.pushEvent('ORDER_CREATED', persisted);

      const fraudRisk = await this.scoreOrder(persisted, data);
      await this.auditOrder('ORDER_CREATED', persisted, data, fraudRisk);

      return this.withFraudRisk(this.toPublicOrder(persisted), fraudRisk);
    }

    const now = new Date();
    const order: OperationalOrder = {
      id: this.normalizeId(data?.id) || randomUUID(),
      serviceId: this.readNumber(data?.serviceId, 50),
      clientId: this.readString(data?.clientId),
      professionalId: this.readString(data?.professionalId),
      professionalName: this.readString(data?.professionalName),
      category: this.readString(data?.category),
      address: this.readString(data?.address),
      title:
        this.readString(data?.title ?? data?.serviceTitle) ||
        'Servico BoraServico',
      description: this.readString(data?.description) || '',
      estimatedPrice: this.readNumber(
        data?.estimatedPrice ?? data?.price,
        189.9,
      ),
      status: 'CREATED',
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);
    this.emitOrderEvent(order, 'order-event', 'Ordem criada');
    this.emitStatus(order, 'order-status-updated', 'CREATED');
    this.pushEvent('ORDER_CREATED', order);

    const fraudRisk = await this.scoreOrder(order, data);
    await this.auditOrder('ORDER_CREATED', order, data, fraudRisk);

    return this.withFraudRisk(this.toPublicOrder(order), fraudRisk);
  }

  async findAll() {
    const persisted = await this.tryFindPersistedOrders();

    if (persisted) {
      return persisted
        .filter((order) => this.isVisibleProductionOrder(order))
        .map((order) => this.toPublicOrder(order));
    }

    return Array.from(this.orders.values())
      .filter((order) => this.isVisibleProductionOrder(order))
      .map((order) => this.toPublicOrder(order));
  }

  async findOne(id: string) {
    const persisted = await this.tryFindPersistedOrder(id);

    if (persisted) {
      return this.toPublicOrder(persisted);
    }

    return this.toPublicOrder(this.ensureOrder(id));
  }

  async requestMediatedBudget(actor: any, data: any) {
    const contactFilter = filterDirectContact(
      data?.description ?? data?.requestDescription ?? data?.briefing,
    );

    if (contactFilter.blocked) {
      return {
        success: false,
        blocked: true,
        error: 'DIRECT_CONTACT_BLOCKED',
        message: contactFilter.message,
        reasons: contactFilter.reasons,
        cleanMessage: contactFilter.cleanMessage,
      };
    }

    const estimatedPrice = 0;
    const created: any = await this.create({
      ...data,
      clientId: data?.clientId ?? actor?.userId,
      title:
        this.readString(data?.title ?? data?.serviceTitle) ||
        this.readString(data?.category) ||
        'Atendimento BoraServico',
      description:
        this.readString(data?.description ?? data?.requestDescription) || '',
      noPricePolicy: true,
      price: 0,
    });
    const orderId = this.readString(created?.orderId ?? created?.id);
    const persistedOrder = await this.tryFindPersistedOrder(orderId);
    const order = persistedOrder ?? this.ensureOrder(orderId);

    order.status = 'MATCHING';
    order.updatedAt = new Date();

    await this.tryUpdatePersistedOrder(order.id, { status: 'MATCHING' });

    const interpretation = this.buildAiInterpretation(data, estimatedPrice);
    const professionalBriefing = this.buildProfessionalBriefing(data, order);
    const matchingQueue = await this.matchingService.dispatch({
      ...data,
      orderId: order.id,
      category: order.category ?? data?.category,
      serviceTitle: this.cleanText(order.title),
      title: this.cleanText(order.title),
      modality: data?.modality ?? order.title,
      noPricePolicy: true,
      targetPrice: 0,
      radiusKm: data?.radiusKm ?? 5,
    });
    const proposals: MediatedProposal[] = [];
    this.proposals.set(order.id, proposals);

    this.emitStatus(order, 'order-status-updated', 'MATCHING');
    this.emitOrderEvent(
      order,
      'budget-requested',
      'Orçamento solicitado e mediado pela plataforma',
    );
    this.emitOrderEvent(
      order,
      'budget-waiting-professionals',
      'Aguardando orçamentos reais dos profissionais',
    );
    RealtimeGateway.emitOperational('new-service', {
      payload: {
        serviceOrderId: order.id,
        briefing: this.formatProfessionalBriefing(professionalBriefing),
        urgency: professionalBriefing.urgency,
        preferredTime: professionalBriefing.desiredPeriod,
        protectedAddress: professionalBriefing.protectedAddress,
        photosCount: this.readNumber(data?.photosCount, 0),
      },
    });
    this.pushEvent('ORDER_CREATED', order);
    await this.auditOrder('MEDIATED_BUDGET_REQUESTED', order, {
      ...data,
      aiInterpretation: interpretation,
    });

    return {
      success: true,
      mediated: true,
      orderId: order.id,
      order: this.toPublicOrder(order),
      mediatedStatus: 'aguardando_profissionais',
      aiInterpretation: interpretation,
      professionalBriefing,
      matchingQueue,
      searchTimeline: matchingQueue?.timeline ?? [],
      responseWindowSeconds: matchingQueue?.responseWindowSeconds ?? 900,
      proposals: proposals.map((proposal) => this.toPublicProposal(proposal)),
      contactAccess: this.lockedContactAccess(order),
      nextStep: 'aguardar_orçamentos_dos_profissionais',
    };
  }

  async listProposals(orderId: string) {
    const order = await this.tryFindPersistedOrder(orderId);
    const normalizedOrderId =
      this.normalizeId(orderId) ?? order?.id ?? this.ensureOrder(orderId).id;
    const proposals = this.proposals.get(normalizedOrderId) ?? [];

    return {
      success: true,
      orderId: normalizedOrderId,
      proposals: proposals.map((proposal) => this.toPublicProposal(proposal)),
    };
  }

  async respondProposal(orderId: string, actor: any, body: any) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);
    const contactFilter = filterDirectContact(
      [
        body?.note,
        body?.observation,
        body?.observacao,
        body?.includes,
        body?.inclui,
        body?.excludes,
        body?.nãoInclui,
        body?.availability,
        body?.disponibilidade,
      ]
        .filter(Boolean)
        .join(' '),
    );

    if (contactFilter.blocked) {
      return {
        success: false,
        blocked: true,
        error: 'DIRECT_CONTACT_BLOCKED',
        message: contactFilter.message,
        reasons: contactFilter.reasons,
        cleanMessage: contactFilter.cleanMessage,
      };
    }

    const amount = this.readNumber(body?.amount ?? body?.value, 0);

    if (amount <= 0) {
      return {
        success: false,
        error: 'INVALID_PROPOSAL_AMOUNT',
        message: 'Valor da proposta deve ser maior que zero',
      };
    }

    const professional = await this.resolveProfessionalIdentity(body, actor);

    if (!professional?.id) {
      return {
        success: false,
        error: 'REAL_PROFESSIONAL_REQUIRED',
        message: 'Proposta exige profissional real identificado no banco.',
      };
    }

    const proposal: MediatedProposal = {
      id: this.normalizeId(body?.id) || randomUUID(),
      orderId: order.id,
      professionalId: professional.id,
      professionalName: professional.name,
      specialty:
        this.readString(body?.specialty ?? body?.profession) ||
        order.category ||
        'Especialista Bora',
      rating: this.readNumber(body?.rating, 4.92),
      amount: this.roundCurrency(amount),
      deadline: this.readString(body?.deadline ?? body?.prazo) || 'Hoje',
      note:
        this.readString(body?.note ?? body?.observation ?? body?.observacao) ||
        'Proposta enviada pelo app, sem contato direto antes do pagamento.',
      includes: this.readString(body?.includes ?? body?.inclui),
      excludes: this.readString(body?.excludes ?? body?.nãoInclui),
      observation: this.readString(body?.observation ?? body?.observacao),
      availability: this.readString(
        body?.availability ?? body?.disponibilidade,
      ),
      materialIncluded: Boolean(
        body?.materialIncluded ?? body?.materialIncluso,
      ),
      etaMinutes: this.readNumber(body?.etaMinutes ?? body?.eta, 14),
      summary:
        this.readString(body?.summary) ||
        'IA organizou valor, prazo, reputacao e chegada prevista.',
      visibleBadges: this.visibleProposalBadges(body),
      conversionMessage:
        this.readString(body?.conversionMessage) ||
        'Resposta rapida aumenta suas chances. Propostas claras costumam converter melhor.',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      status: 'PENDING',
      createdAt: new Date(),
      professionalAcceptedAt: new Date(),
      negotiationRound: 0,
      maxNegotiationRounds: 2,
      finalRound: false,
      lastActor: 'PROFESSIONAL',
    };
    const current = this.proposals.get(order.id) ?? [];
    this.proposals.set(order.id, [proposal, ...current]);

    await this.tryUpdatePersistedOrder(order.id, { status: 'MATCHING' });
    this.emitOrderEvent(order, 'proposal-received', 'Proposta recebida');
    this.pushEvent('PROPOSAL_RECEIVED', order);
    await this.auditOrder('MEDIATED_PROPOSAL_RECEIVED', order, {
      professionalId: professional.id,
      amount: proposal.amount,
    });

    return {
      success: true,
      orderId: order.id,
      proposal: this.toPublicProposal(proposal),
      contactAccess: this.lockedContactAccess(order),
    };
  }

  async acceptProposal(
    orderId: string,
    proposalId: string,
    actor?: any,
    body?: any,
  ) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);
    const proposals = this.proposals.get(order.id) ?? [];
    const proposal = proposals.find((item) => item.id === proposalId);

    if (!proposal) {
      return {
        success: false,
        error: 'PROPOSAL_NOT_FOUND',
        message: 'Proposta não encontrada',
      };
    }

    proposal.clientAcceptedAt = new Date();
    proposal.professionalAcceptedAt =
      proposal.professionalAcceptedAt ?? new Date();
    proposal.agreementAt = new Date();

    for (const item of proposals) {
      item.status = item.id === proposal.id ? 'AGREEMENT_CLOSED' : 'DECLINED';
    }

    const persisted = await this.tryUpdatePersistedOrder(order.id, {
      status: 'ACCEPTED',
      professionalId: proposal.professionalId,
      price: proposal.amount,
      acceptedAt: new Date(),
    });
    const acceptedOrder = persisted ?? order;

    acceptedOrder.status = 'ACCEPTED';
    acceptedOrder.professionalId = proposal.professionalId;
    acceptedOrder.professionalName = proposal.professionalName;
    acceptedOrder.estimatedPrice = proposal.amount;
    acceptedOrder.acceptedAt = acceptedOrder.acceptedAt ?? new Date();
    acceptedOrder.updatedAt = new Date();

    this.emitStatus(acceptedOrder, 'order-status-updated', 'ACCEPTED');
    this.emitOrderEvent(
      acceptedOrder,
      'payment-required',
      'Acordo fechado. Pagamento protegido obrigatorio para liberar contato.',
    );
    this.pushEvent('PROPOSAL_ACCEPTED', acceptedOrder);
    await this.auditOrder('MEDIATED_PROPOSAL_ACCEPTED', acceptedOrder, {
      proposalId: proposal.id,
      professionalId: proposal.professionalId,
      amount: proposal.amount,
    });

    return {
      success: true,
      orderId: acceptedOrder.id,
      mediatedStatus: 'acordo_fechado',
      status: 'aguardando_pagamento',
      proposal: this.toPublicProposal(proposal),
      order: this.toPublicOrder(acceptedOrder),
      contactAccess: this.lockedContactAccess(acceptedOrder),
      agreementClosed: true,
      doubleAcceptance: {
        professionalAccepted: Boolean(proposal.professionalAcceptedAt),
        clientAccepted: Boolean(proposal.clientAcceptedAt),
        agreementClosed: true,
      },
      nextStep: 'confirmar_e_pagar',
    };
  }

  async professionalAcceptProposal(
    orderId: string,
    proposalId: string,
    actor?: any,
  ) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);
    const proposal = this.findProposal(order.id, proposalId);

    if (!proposal) {
      return {
        success: false,
        error: 'PROPOSAL_NOT_FOUND',
        message: 'Proposta não encontrada',
      };
    }

    proposal.professionalAcceptedAt = new Date();
    proposal.status = proposal.clientAcceptedAt
      ? 'AGREEMENT_CLOSED'
      : 'PROFESSIONAL_ACCEPTED';

    this.emitOrderEvent(
      order,
      'proposal-professional-accepted',
      'Profissional confirmou a proposta',
    );
    await this.auditOrder('MEDIATED_PROPOSAL_PROFESSIONAL_ACCEPTED', order, {
      actorId: actor?.userId,
      proposalId,
    });

    return {
      success: true,
      orderId: order.id,
      mediatedStatus:
        proposal.status === 'AGREEMENT_CLOSED'
          ? 'acordo_fechado'
          : 'aguardando_cliente',
      proposal: this.toPublicProposal(proposal),
      contactAccess: this.lockedContactAccess(order),
    };
  }

  async declineProposal(
    orderId: string,
    proposalId: string,
    actor?: any,
    body?: any,
  ) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);
    const proposal = this.findProposal(order.id, proposalId);

    if (!proposal) {
      return {
        success: false,
        error: 'PROPOSAL_NOT_FOUND',
        message: 'Proposta não encontrada',
      };
    }

    const contactFilter = filterDirectContact(body?.reason ?? body?.message);

    if (contactFilter.blocked) {
      return {
        success: false,
        blocked: true,
        error: 'DIRECT_CONTACT_BLOCKED',
        message: contactFilter.message,
        reasons: contactFilter.reasons,
        cleanMessage: contactFilter.cleanMessage,
      };
    }

    proposal.status = 'DECLINED';
    this.emitOrderEvent(order, 'proposal-declined', 'Proposta recusada');
    await this.auditOrder('MEDIATED_PROPOSAL_DECLINED', order, {
      actorId: actor?.userId,
      proposalId,
      reason: this.readString(body?.reason ?? body?.message),
    });

    return {
      success: true,
      orderId: order.id,
      mediatedStatus: 'proposta_recusada',
      proposal: this.toPublicProposal(proposal),
      contactAccess: this.lockedContactAccess(order),
    };
  }

  async sendNegotiation(orderId: string, actor: any, body: any) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);
    const proposals = this.proposals.get(order.id) ?? [];
    const proposal =
      this.findProposal(order.id, body?.proposalId) ??
      proposals.find((item) => item.status !== 'DECLINED') ??
      proposals[0];

    if (!proposal) {
      return {
        success: false,
        error: 'PROPOSAL_NOT_FOUND',
        message: 'Proposta não encontrada',
      };
    }

    if (
      proposal.status === 'AGREEMENT_CLOSED' ||
      proposal.status === 'ACCEPTED'
    ) {
      return {
        success: false,
        error: 'NEGOTIATION_ALREADY_CLOSED',
        message: 'Negociação já encerrada',
        proposal: this.toPublicProposal(proposal),
      };
    }

    const action = this.readString(body?.action)?.toUpperCase();
    const actorRole = this.readString(actor?.role)?.toUpperCase() || 'CLIENT';
    const currentRound = proposal.negotiationRound ?? 0;
    const maxRounds = proposal.maxNegotiationRounds ?? 2;

    if (action === 'REQUEST_DETAILS') {
      proposal.status = 'DETAILS_REQUESTED';
      proposal.summary = 'Profissional pediu mais detalhes.';
      proposal.note =
        this.readString(body?.message) ||
        'Profissional pediu mais detalhes sobre o serviço.';
      proposal.lastActor = 'PROFESSIONAL';

      this.emitOrderEvent(
        order,
        'proposal-details-requested',
        'Profissional pediu mais detalhes',
      );
      RealtimeGateway.emitOperational('proposal-details-requested', {
        orderId: order.id,
        proposalId: proposal.id,
        professionalId: proposal.professionalId,
        message: proposal.note,
      });

      await this.auditOrder('MEDIATED_DETAILS_REQUESTED', order, {
        proposalId: proposal.id,
        professionalId: proposal.professionalId,
      });

      return {
        success: true,
        orderId: order.id,
        action: 'REQUEST_DETAILS',
        proposal: this.toPublicProposal(proposal),
        message: proposal.note,
      };
    }

    if (currentRound >= maxRounds) {
      proposal.finalRound = true;
      proposal.summary = 'Proposta final. Decida aceitar ou recusar.';
      return {
        success: false,
        error: 'NEGOTIATION_LIMIT_REACHED',
        message: 'Limite de negociação atingido. Agora é aceitar ou recusar.',
        proposal: this.toPublicProposal(proposal),
      };
    }

    const rawAmount =
      body?.clientCounterAmount ??
      body?.professionalCounterAmount ??
      body?.amount ??
      body?.value;
    const requestedAmount = this.readNumber(rawAmount, proposal.amount);

    if (requestedAmount <= 0) {
      return {
        success: false,
        error: 'INVALID_NEGOTIATION_AMOUNT',
        message: 'Valor da negociação deve ser maior que zero',
      };
    }

    const message = this.readString(
      body?.reason ?? body?.message ?? body?.note,
    );
    const contactFilter = filterDirectContact(message);

    if (contactFilter.blocked) {
      return {
        success: false,
        blocked: true,
        error: 'DIRECT_CONTACT_BLOCKED',
        message: contactFilter.message,
        reasons: contactFilter.reasons,
        cleanMessage: contactFilter.cleanMessage,
      };
    }

    const nextRound = Math.min(
      maxRounds,
      this.readNumber(body?.round, currentRound + 1),
    );

    proposal.amount = this.roundCurrency(requestedAmount);
    proposal.status = 'NEGOTIATING';
    proposal.negotiationRound = nextRound;
    proposal.maxNegotiationRounds = maxRounds;
    proposal.finalRound = nextRound >= maxRounds || Boolean(body?.finalRound);
    proposal.lastActor = actorRole;
    proposal.summary = proposal.finalRound
      ? 'Proposta final enviada.'
      : 'Contraproposta enviada.';
    proposal.note = message || proposal.summary;
    proposal.clientAcceptedAt = undefined;
    proposal.professionalAcceptedAt =
      actorRole === 'PROFESSIONAL'
        ? new Date()
        : proposal.professionalAcceptedAt;
    proposal.agreementAt = undefined;

    this.emitOrderEvent(
      order,
      'proposal-negotiation',
      'Contraproposta enviada',
    );
    RealtimeGateway.emitOperational('proposal-negotiation', {
      orderId: order.id,
      proposalId: proposal.id,
      amount: proposal.amount,
      round: proposal.negotiationRound,
      maxRounds: proposal.maxNegotiationRounds,
      finalRound: proposal.finalRound,
      lastActor: proposal.lastActor,
      message: proposal.note,
    });

    await this.auditOrder('MEDIATED_NEGOTIATION_SENT', order, {
      proposalId: proposal.id,
      amount: proposal.amount,
      round: proposal.negotiationRound,
      finalRound: proposal.finalRound,
    });

    return {
      success: true,
      orderId: order.id,
      proposal: this.toPublicProposal(proposal),
      message: this.transformNegotiationForOtherSide(
        actorRole === 'PROFESSIONAL' ? 'Profissional' : 'Cliente',
        proposal.amount,
        proposal.finalRound ? 'Proposta final.' : proposal.note,
      ),
      negotiation: {
        round: proposal.negotiationRound,
        maxRounds: proposal.maxNegotiationRounds,
        finalRound: proposal.finalRound,
      },
    };
  }

  async closeAgreement(orderId: string, actor: any, body: any) {
    const proposals = this.proposals.get(orderId) ?? [];
    const proposal =
      this.findProposal(orderId, body?.proposalId) ??
      proposals.find((item) => item.status !== 'DECLINED') ??
      proposals[0];

    if (!proposal) {
      return {
        success: false,
        error: 'PROPOSAL_NOT_FOUND',
        message: 'Proposta não encontrada',
      };
    }

    if (actor?.role?.toString().toUpperCase() === 'PROFESSIONAL') {
      return this.professionalAcceptProposal(orderId, proposal.id, actor);
    }

    return this.acceptProposal(orderId, proposal.id, actor, body);
  }

  async finalProposal(orderId: string) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);
    const proposal =
      (this.proposals.get(order.id) ?? []).find((item) =>
        ['AGREEMENT_CLOSED', 'ACCEPTED', 'CLIENT_ACCEPTED'].includes(
          item.status,
        ),
      ) ?? (this.proposals.get(order.id) ?? [])[0];

    if (!proposal) {
      return {
        success: false,
        error: 'PROPOSAL_NOT_FOUND',
        message: 'Proposta final não encontrada',
      };
    }

    return {
      success: true,
      orderId: order.id,
      title: 'Proposta final',
      proposal: this.toFinalProposal(order, proposal),
      contactAccess: this.lockedContactAccess(order),
      nextStep: 'confirmar_e_pagar',
    };
  }

  async confirmProtectedPayment(orderId: string, body: any) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);
    const acceptedProposal = (this.proposals.get(order.id) ?? []).find(
      (proposal) =>
        proposal.status === 'AGREEMENT_CLOSED' ||
        proposal.status === 'ACCEPTED' ||
        proposal.status === 'CLIENT_ACCEPTED',
    );
    const amount = this.readNumber(
      body?.amount ?? acceptedProposal?.amount ?? order.estimatedPrice,
      order.estimatedPrice,
    );
    let payment: any;

    try {
      const escrow: any = await this.paymentsService.createEscrow({
        orderId: order.id,
        amount,
      });
      payment = escrow?.payment ?? escrow;
    } catch (error) {
      payment = {
        success: false,
        error: 'PAYMENT_CONFIRMATION_PENDING',
        message:
          error instanceof Error
            ? error.message
            : 'Pagamento protegido ainda não confirmado',
      };
    }

    const paymentConfirmed =
      payment?.success !== false &&
      ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(
        this.readString(payment?.status ?? payment?.paymentStatus)
          ?.toUpperCase() ?? '',
      );

    if (paymentConfirmed) {
      this.paymentConfirmedOrders.add(order.id);
      const unlockedOrder =
        (await this.tryUpdatePersistedOrder(order.id, {
          status: order.status === 'CREATED' ? 'ACCEPTED' : order.status,
        })) ?? order;

      unlockedOrder.paymentConfirmed = true;
      unlockedOrder.protectedPaymentStatus = this.readString(
        payment?.status ?? payment?.paymentStatus,
      );
      unlockedOrder.escrowStatus = this.readString(
        payment?.escrowStatus ?? payment?.escrow?.status,
      );
      order.paymentConfirmed = true;
      order.protectedPaymentStatus = unlockedOrder.protectedPaymentStatus;
      order.escrowStatus = unlockedOrder.escrowStatus;

      await this.safeTimeline(unlockedOrder.id, 'PAYMENT_CONFIRMED', {
        title: 'Pagamento confirmado',
        description:
          'Pagamento protegido confirmado. Missao profissional liberada.',
        state: 'complete',
      });
      this.emitOrderEvent(
        unlockedOrder,
        'payment-approved',
        'Pagamento aprovado',
      );
      this.emitOrderEvent(
        unlockedOrder,
        'payment-confirmed',
        'Pagamento protegido confirmado',
      );
      this.emitOrderEvent(
        unlockedOrder,
        'contact-released',
        'Contato liberado após pagamento protegido',
      );
      await this.safeTimeline(unlockedOrder.id, 'CONTACT_RELEASED', {
        title: 'Contato e rota liberados',
        description: 'Endereço, chat e Google Maps liberados para a missao.',
        state: 'complete',
      });
      this.pushEvent('PAYMENT_APPROVED', unlockedOrder);
      this.pushEvent('PAYMENT_CONFIRMED', unlockedOrder);
      this.pushEvent('CONTACT_RELEASED', unlockedOrder);
    }

    const publicOrder = this.toPublicOrder(order);

    return {
      success: paymentConfirmed,
      orderId: order.id,
      mediatedStatus: paymentConfirmed
        ? 'contato_liberado'
        : 'aguardando_pagamento',
      payment,
      order: publicOrder,
      contactAccess: paymentConfirmed
        ? await this.unlockedContactAccess(order)
        : this.lockedContactAccess(order),
    };
  }

  async contactAccess(orderId: string) {
    const order =
      (await this.tryFindPersistedOrder(orderId)) ?? this.ensureOrder(orderId);

    if (await this.hasConfirmedPayment(order.id)) {
      return this.unlockedContactAccess(order);
    }

    return this.lockedContactAccess(order);
  }

  async accept(id: string, professionalId?: string) {
    const professional = await this.resolveProfessionalIdentity(
      { professionalId },
      {},
    );

    if (!professional) {
      return {
        success: false,
        error: 'REAL_PROFESSIONAL_REQUIRED',
        message: 'Aceite exige profissional real identificado no banco.',
      };
    }

    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'ACCEPTED',
      professionalId: professional.id,
      acceptedAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'ACCEPTED');
      this.emitOrderEvent(persisted, 'match-found', 'Profissional encontrado');
      this.pushEvent('PROFESSIONAL_FOUND', persisted);
      await this.auditOrder('ORDER_ACCEPTED', persisted, {
        professionalId: professional.id,
      });

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'ACCEPTED';
    order.professionalId = professional.id;
    order.professionalName = professional.name;
    order.acceptedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'ACCEPTED');
    this.emitOrderEvent(order, 'match-found', 'Profissional encontrado');
    this.pushEvent('PROFESSIONAL_FOUND', order);
    await this.auditOrder('ORDER_ACCEPTED', order, {
      professionalId: professional.id,
    });

    return this.toPublicOrder(order);
  }

  async professionalOnTheWay(id: string, actor?: any, body: any = {}) {
    const order =
      (await this.tryFindPersistedOrder(id)) ?? this.ensureOrder(id);
    const mission = await this.validateMissionPrerequisites(
      order,
      actor,
      body,
      {
        requireGeofence: false,
      },
    );

    if (!mission.allowed) {
      return mission;
    }

    await this.recordTrackingEvent(
      order.id,
      actor,
      body,
      'PROFESSIONAL_ON_THE_WAY',
      {
        eta: this.readString(body?.eta) ?? 'Atualizado agora',
        routeProgress: this.readNumber(body?.routeProgress, 0.32),
        distanceMeters: mission.distanceMeters,
        destination: mission.destination,
      },
    );
    await this.safeTimeline(order.id, 'PROFESSIONAL_ON_THE_WAY', {
      title: 'Deslocamento iniciado',
      description: 'GPS ativo, rota aberta e tracking em tempo real.',
      lat: mission.location?.lat,
      lng: mission.location?.lng,
      state: 'current',
    });
    this.emitOrderEvent(
      order,
      'professional-en-route',
      'Profissional a caminho',
    );
    this.emitOrderEvent(
      order,
      'displacement-started',
      'Deslocamento iniciado',
    );
    this.pushEvent('DISPLACEMENT_STARTED', order);
    this.pushEvent('PROFESSIONAL_ON_THE_WAY', order);
    await this.auditOrder('MISSION_DISPLACEMENT_STARTED', order, {
      actorId: this.readString(actor?.userId),
      ...body,
      distanceMeters: mission.distanceMeters,
      fraudRisk: mission.fraud,
    });

    return {
      ...this.toPublicOrder(order),
      mission: this.buildMissionPayload(
        order,
        mission,
        'PROFESSIONAL_ON_THE_WAY',
      ),
    };
  }

  async start(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    });

    if (persisted) {
      await this.safeTimeline(persisted.id, 'IN_PROGRESS', {
        title: 'Servico em execução',
        description: 'Atendimento iniciado apos check-in.',
        state: 'current',
      });
      this.emitStatus(persisted, 'order-status-updated', 'IN_PROGRESS');
      this.emitOrderEvent(persisted, 'execution-started', 'Execucao iniciada');
      this.pushEvent('SERVICE_STARTED', persisted);
      this.pushEvent('SERVICE_IN_PROGRESS', persisted);

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'IN_PROGRESS';
    order.startedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'IN_PROGRESS');
    this.emitOrderEvent(order, 'execution-started', 'Execucao iniciada');
    this.pushEvent('SERVICE_STARTED', order);
    this.pushEvent('SERVICE_IN_PROGRESS', order);

    return this.toPublicOrder(order);
  }

  async checkIn(id: string, actor?: any, body: any = {}) {
    const order =
      (await this.tryFindPersistedOrder(id)) ?? this.ensureOrder(id);
    const mission = await this.validateMissionPrerequisites(
      order,
      actor,
      body,
      {
        requireGeofence: true,
      },
    );

    if (!mission.allowed) {
      return mission;
    }

    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'CHECKED_IN',
      checkInAt: new Date(),
    });

    if (persisted) {
      await this.recordTrackingEvent(persisted.id, actor, body, 'CHECKED_IN', {
        distanceMeters: mission.distanceMeters,
        geofenceValidated: true,
      });
      await this.safeTimeline(persisted.id, 'CHECKED_IN', {
        title: 'Check-in realizado',
        description: 'Chegada validada por geofence e GPS.',
        lat: mission.location?.lat,
        lng: mission.location?.lng,
        state: 'complete',
      });
      this.emitStatus(persisted, 'order-status-updated', 'CHECKED_IN');
      this.emitOrderEvent(persisted, 'check-in', 'Check-in realizado');
      this.emitOrderEvent(
        persisted,
        'professional-arrived',
        'O profissional chegou ao local do serviço.',
      );
      this.pushEvent('CHECK_IN', persisted);

      return {
        ...this.toPublicOrder(persisted),
        mission: this.buildMissionPayload(persisted, mission, 'CHECKED_IN'),
      };
    }

    const now = new Date();

    order.status = 'CHECKED_IN';
    order.checkInAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CHECKED_IN');
    this.emitOrderEvent(order, 'check-in', 'Check-in realizado');
    this.emitOrderEvent(
      order,
      'professional-arrived',
      'O profissional chegou ao local do serviço.',
    );
    this.pushEvent('CHECK_IN', order);

    return {
      ...this.toPublicOrder(order),
      mission: this.buildMissionPayload(order, mission, 'CHECKED_IN'),
    };
  }

  async checkOut(id: string, actor?: any, body: any = {}) {
    const order =
      (await this.tryFindPersistedOrder(id)) ?? this.ensureOrder(id);
    const gps = this.readGps(body);

    if (!gps) {
      return {
        success: false,
        error: 'GPS_REQUIRED',
        message: 'Ative sua localizacao para finalizar o serviço.',
      };
    }

    const proofId = this.readString(body?.proofId);
    const proofUrl = this.readString(body?.proofUrl ?? body?.fileUrl);

    if (!proofId && !proofUrl) {
      return {
        success: false,
        error: 'PROOF_REQUIRED',
        message: 'Envie uma foto ou prova para finalizar o serviço.',
      };
    }

    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'CHECKED_OUT',
      checkOutAt: new Date(),
    });

    if (persisted) {
      await this.recordTrackingEvent(persisted.id, actor, body, 'CHECKED_OUT', {
        proofId,
        proofUrl,
        note: this.readString(body?.note ?? body?.comment),
      });
      await this.safeTimeline(persisted.id, 'CHECKED_OUT', {
        title: 'Finalizacao enviada',
        description: 'Check-out registrado com localizacao final e prova.',
        lat: gps.lat,
        lng: gps.lng,
        proofPhotoUrl: proofUrl,
        state: 'complete',
      });
      this.emitStatus(persisted, 'order-status-updated', 'CHECKED_OUT');
      this.emitOrderEvent(
        persisted,
        'proof-uploaded',
        'Prova pronta para validacao',
      );
      this.emitOrderEvent(persisted, 'service-finished', 'Servico finalizado');
      this.pushEvent('SERVICE_FINISHED', persisted);

      return {
        ...this.toPublicOrder(persisted),
        proofRequired: true,
        proofId,
        proofUrl,
      };
    }

    const now = new Date();

    order.status = 'CHECKED_OUT';
    order.checkOutAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CHECKED_OUT');
    this.emitOrderEvent(order, 'proof-uploaded', 'Prova pronta para validacao');
    this.emitOrderEvent(order, 'service-finished', 'Servico finalizado');
    this.pushEvent('SERVICE_FINISHED', order);

    return {
      ...this.toPublicOrder(order),
      proofRequired: true,
      proofId,
      proofUrl,
    };
  }

  async complete(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'COMPLETED');
      this.emitOrderEvent(persisted, 'order-completed', 'Ordem concluida');
      this.emitPaymentReleased(persisted);
      this.pushEvent('SERVICE_COMPLETED', persisted);
      this.pushEvent('PAYMENT_RELEASED', persisted);
      await this.auditOrder('ORDER_COMPLETED', persisted);

      return {
        ...this.toPublicOrder(persisted),
        paymentRelease: await this.releasePaymentForOrder(persisted.id),
      };
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'COMPLETED';
    order.completedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'COMPLETED');
    this.emitOrderEvent(order, 'order-completed', 'Ordem concluida');
    this.emitPaymentReleased(order);
    this.pushEvent('SERVICE_COMPLETED', order);
    this.pushEvent('PAYMENT_RELEASED', order);
    await this.auditOrder('ORDER_COMPLETED', order);

    return {
      ...this.toPublicOrder(order),
      paymentRelease: await this.releasePaymentForOrder(order.id),
    };
  }

  async cancel(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'CANCELLED');
      this.emitOrderEvent(persisted, 'order-event', 'Ordem cancelada');
      await this.auditOrder('ORDER_CANCELLED', persisted);

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'CANCELLED';
    order.cancelledAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CANCELLED');
    this.emitOrderEvent(order, 'order-event', 'Ordem cancelada');
    await this.auditOrder('ORDER_CANCELLED', order);

    return this.toPublicOrder(order);
  }

  private estimateMediatedPrice(data: any) {
    void data;
    return 0;
  }

  private buildAiInterpretation(data: any, estimatedPrice: number) {
    void estimatedPrice;
    const category =
      this.readString(data?.category ?? data?.categoryName) ||
      'Servico residencial';
    const description =
      this.readString(data?.description ?? data?.requestDescription) ||
      'Solicitacao sem descricao detalhada';
    const urgency = this.readString(data?.urgency) || 'Normal';
    const complexity =
      description.length > 220
        ? 'alta'
        : description.length > 90
          ? 'media'
          : 'baixa';

    return {
      category,
      urgency,
      complexity,
      noPricePolicy: true,
      riskLevel: urgency.toLowerCase().includes('emerg') ? 'medio' : 'baixo',
      pricePolicy:
        'A IA não define preço, não gera orçamento automatico e não calcula valor final.',
      summary:
        'IA interpretou categoria, urgência, complexidade, reputação e deslocamento antes de expor contato.',
      contactPolicy:
        'Contato liberado após confirmação do pagamento protegido.',
    };
  }

  private buildMediatedProposals(
    order: OperationalOrder,
    data: any,
    estimatedPrice: number,
    matchingQueue?: any,
  ) {
    const category =
      this.readString(data?.category ?? data?.categoryName) ||
      order.category ||
      'Especialista Bora';
    const queueProfessionals = Array.isArray(
      matchingQueue?.currentProfessionals,
    )
      ? matchingQueue.currentProfessionals
      : [];

    if (queueProfessionals.length > 0) {
      return queueProfessionals
        .slice(0, 3)
        .map((professional: any, index: number) => {
          const averagePrice = this.readNumber(
            professional?.averagePrice,
            estimatedPrice,
          );
          const amount = this.roundCurrency(
            averagePrice * 0.74 + estimatedPrice * 0.26 + index * 4,
          );

          return {
            id: `proposal-${order.id}-${index + 1}`,
            orderId: order.id,
            professionalId: this.readString(professional?.id),
            professionalName:
              this.readString(professional?.name) ?? 'Profissional verificado',
            specialty: this.readString(professional?.specialty) ?? category,
            rating: this.readNumber(professional?.rating, 4.9),
            amount,
            deadline:
              this.readString(professional?.availabilityLabel) ??
              'Disponível para atendimento',
            note: 'Pagamento protegido libera o contato com segurança.',
            includes: 'Mão de obra e avaliação inicial',
            excludes: 'Materiais não combinados',
            observation: 'Valor pode ser ajustado se houver escopo extra.',
            availability:
              this.readString(professional?.availabilityLabel) ??
              'Disponível para atendimento',
            materialIncluded: false,
            etaMinutes: this.readNumber(professional?.etaMinutes, 14),
            summary:
              this.readString(professional?.headline) ??
              'Boa opção para o serviço, com proposta clara e contato protegido.',
            visibleBadges: this.visibleProposalBadges(professional),
            conversionMessage:
              index === 0
                ? 'Essa proposta tem bom custo-benefício.'
                : 'Você pode aceitar agora ou aguardar novas respostas.',
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            status: 'PENDING' as MediatedProposalStatus,
            createdAt: new Date(),
            professionalAcceptedAt: new Date(),
            negotiationRound: 0,
            maxNegotiationRounds: 2,
            finalRound: false,
            lastActor: 'PROFESSIONAL',
          };
        })
        .filter((proposal: any) => Boolean(proposal.professionalId));
    }

    return [];
  }

  private toPublicProposal(proposal: MediatedProposal) {
    return {
      id: proposal.id,
      orderId: proposal.orderId,
      professionalId: proposal.professionalId,
      professionalName: proposal.professionalName,
      specialty: proposal.specialty,
      rating: proposal.rating,
      amount: proposal.amount,
      deadline: proposal.deadline,
      note: proposal.note,
      includes: proposal.includes,
      excludes: proposal.excludes,
      observation: proposal.observation,
      availability: proposal.availability,
      materialIncluded: proposal.materialIncluded ?? false,
      etaMinutes: proposal.etaMinutes,
      summary: proposal.summary,
      visibleBadges: proposal.visibleBadges,
      clientLabel: this.primaryProposalLabel(proposal),
      conversionMessage: proposal.conversionMessage,
      status: proposal.status,
      negotiationRound: proposal.negotiationRound ?? 0,
      maxNegotiationRounds: proposal.maxNegotiationRounds ?? 2,
      finalRound: proposal.finalRound ?? false,
      lastActor: proposal.lastActor,
      createdAt: proposal.createdAt.toISOString(),
      expiresAt: proposal.expiresAt.toISOString(),
      clientAcceptedAt: proposal.clientAcceptedAt?.toISOString(),
      professionalAcceptedAt: proposal.professionalAcceptedAt?.toISOString(),
      agreementAt: proposal.agreementAt?.toISOString(),
      secondsRemaining: Math.max(
        0,
        Math.ceil((proposal.expiresAt.getTime() - Date.now()) / 1000),
      ),
      contactPolicy:
        'Telefone, WhatsApp, chat e endereço ficam bloqueados antes do pagamento protegido.',
    };
  }

  private toFinalProposal(order: OperationalOrder, proposal: MediatedProposal) {
    return {
      professional: proposal.professionalName,
      professionalId: proposal.professionalId,
      value: proposal.amount,
      amount: proposal.amount,
      dateTime: proposal.deadline,
      deadline: proposal.deadline,
      includes: proposal.includes ?? 'Mão de obra',
      excludes: proposal.excludes ?? 'Materiais não combinados',
      observations:
        proposal.observation ??
        proposal.note ??
        'Contato liberado somente após pagamento confirmado.',
      protectedPaymentPolicy:
        'Pagamento protegido confirma o serviço, mantém o split da plataforma e libera contato.',
      order: {
        id: order.id,
        service: order.title,
        addressProtected: this.protectedAddress(order.address),
      },
      status: proposal.status,
      contactUnlocked: false,
    };
  }

  private buildProfessionalBriefing(data: any, order: OperationalOrder) {
    const photosCount = this.readNumber(data?.photosCount, 0);
    const desiredPeriod =
      this.readString(data?.preferredTime ?? data?.periodoDesejado) ??
      'A combinar';
    const locationType =
      this.readString(data?.locationType ?? data?.tipoLocal) ??
      'Local informado pelo cliente';
    const urgency = this.readString(data?.urgency) ?? 'Normal';
    const details =
      this.readString(data?.description ?? data?.requestDescription) ??
      order.description;

    return {
      service: order.title,
      local: locationType,
      urgency,
      desiredPeriod,
      details,
      photos: photosCount > 0 ? 'anexadas' : 'opcionais não anexadas',
      protectedAddress: this.protectedAddress(order.address),
      aiObservation: this.aiObservation(order.title, details),
      internalEngineeringHidden: true,
    };
  }

  private formatProfessionalBriefing(briefing: {
    service: string;
    local: string;
    urgency: string;
    desiredPeriod: string;
    details: string;
    photos: string;
    aiObservation: string;
  }) {
    return [
      `Servico: ${briefing.service}`,
      `Local: ${briefing.local}`,
      `Urgencia: ${briefing.urgency}`,
      `Periodo desejado: ${briefing.desiredPeriod}`,
      `Detalhes: ${briefing.details}`,
      `Fotos: ${briefing.photos}`,
      `Observacao IA: ${briefing.aiObservation}`,
    ].join('\n');
  }

  private findProposal(orderId: string, proposalId?: any) {
    const normalizedProposalId = this.readString(proposalId);

    if (!normalizedProposalId) {
      return undefined;
    }

    return (this.proposals.get(orderId) ?? []).find(
      (item) => item.id === normalizedProposalId,
    );
  }

  private primaryProposalLabel(proposal: MediatedProposal) {
    const badges = proposal.visibleBadges.map((badge) => badge.toLowerCase());

    if (badges.some((badge) => badge.includes('custo'))) {
      return 'Melhor custo-beneficio';
    }

    if (badges.some((badge) => badge.includes('rapida'))) {
      return 'Resposta mais rapida';
    }

    if (proposal.etaMinutes <= 10) {
      return 'Menor prazo';
    }

    if (proposal.rating >= 4.9) {
      return 'Melhor reputacao';
    }

    return 'Boa disponibilidade';
  }

  private transformNegotiationForOtherSide(
    role: any,
    amount: number,
    message: string,
  ) {
    const value = `R$ ${amount.toFixed(2).replace('.', ',')}`;
    const actor = this.readString(role)?.toLowerCase().includes('professional')
      ? 'O profissional'
      : 'O cliente';
    const suffix = message ? ` Motivo: ${message}` : '';

    return `${actor} propôs ${value}. Deseja aceitar, recusar ou enviar contraproposta?${suffix}`;
  }

  private isAbusiveBudget(order: OperationalOrder, amount: number) {
    return amount > order.estimatedPrice * 1.45;
  }

  private protectedAddress(address?: string) {
    const text = this.readString(address);

    if (!text) {
      return 'Endereço protegido até o pagamento protegido';
    }

    const parts = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const safeParts = parts.filter((part) => {
      const normalized = part
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return (
        !/\d/.test(normalized) &&
        !/\b(rua|avenida|av|travessa|número|nro|apto|apartamento|bloco|casa|cep)\b/.test(
          normalized,
        )
      );
    });
    const region = safeParts[safeParts.length - 1];

    return region
      ? `${region}, endereço protegido`
      : 'Região protegida até o pagamento protegido';
  }

  private aiObservation(service: string, details: string) {
    const text = `${service} ${details}`.toLowerCase();

    if (text.includes('pint')) {
      return 'Avaliar necessidade de massa/correção antes do orçamento final.';
    }

    if (text.includes('vaz') || text.includes('hidr')) {
      return 'Confirmar origem do problema antes de definir material.';
    }

    if (text.includes('eletr') || text.includes('energia')) {
      return 'Checar segurança do ponto antes de executar.';
    }

    return 'Confirmar escopo e disponibilidade antes do fechamento.';
  }

  private lockedContactAccess(order: OperationalOrder) {
    return {
      success: true,
      orderId: order.id,
      unlocked: false,
      contactUnlocked: false,
      message: 'Contato liberado após confirmação do pagamento protegido.',
      blocked: [
        'chat',
        'phone',
        'whatsapp',
        'clientAddress',
        'googleMapsRoute',
      ],
      available: [],
    };
  }

  private async unlockedContactAccess(order: OperationalOrder) {
    const proposal = (this.proposals.get(order.id) ?? []).find(
      (item) => item.status === 'ACCEPTED',
    );
    const contacts = await this.loadOrderContacts(order);

    return {
      success: true,
      orderId: order.id,
      unlocked: true,
      contactUnlocked: true,
      message: 'Contato liberado pelo pagamento protegido confirmado.',
      available: ['chat', 'clientAddress', 'googleMapsRoute'],
      phoneAvailable: false,
      whatsappAvailable: false,
      contactSource: 'protected-payment-confirmed',
      clientAddress: order.address,
      googleMapsRoute: order.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            order.address,
          )}`
        : undefined,
      client: contacts.client,
      professional: proposal
        ? {
            id: proposal.professionalId,
            name: proposal.professionalName,
            specialty: proposal.specialty,
            rating: proposal.rating,
          }
        : contacts.professional,
    };
  }

  private async resolveProfessionalIdentity(body: any, actor: any) {
    const professionalId = this.readString(
      body?.professionalId ?? actor?.userId,
    );

    if (!professionalId) {
      return null;
    }

    const user = await this.prisma.user
      .findUnique({
        where: { id: professionalId },
        select: { id: true, name: true, role: true },
      })
      .catch(() => null);

    const role = this.readString(user?.role)?.toUpperCase();

    if (
      !user ||
      !['PROFESSIONAL', 'PROFISSIONAL', 'PROVIDER', 'PRESTADOR'].includes(
        role ?? '',
      )
    ) {
      return null;
    }

    const name = this.readString(
      body?.professionalName ?? body?.name ?? user.name,
    );

    if (!name || containsOperationalResidue(name)) {
      return null;
    }

    return { id: user.id, name };
  }

  private async loadOrderContacts(order: OperationalOrder) {
    const ids = [order.clientId, order.professionalId]
      .map((id) => this.readString(id))
      .filter(Boolean) as string[];

    if (ids.length === 0) {
      return { client: undefined, professional: undefined };
    }

    const users: any[] = await this.prisma.user
      .findMany({
        where: { id: { in: Array.from(new Set(ids)) } },
        select: { id: true, name: true, email: true, role: true },
      })
      .catch((): any[] => []);
    const toContact = (user: any) =>
      user
        ? {
            id: user.id,
            name: this.readString(user.name),
            email: this.readString(user.email),
          }
        : undefined;

    return {
      client: toContact(users.find((user) => user.id === order.clientId)),
      professional: toContact(
        users.find((user) => user.id === order.professionalId),
      ),
    };
  }

  private async validateMissionPrerequisites(
    order: OperationalOrder,
    actor: any,
    body: any,
    options: { requireGeofence: boolean },
  ) {
    const gps = this.readGps(body);
    const paymentConfirmed = await this.hasConfirmedPayment(order.id);
    const addressValid = Boolean(
      this.readString(order.address ?? body?.address),
    );
    const destination = this.resolveDestination(body);
    const distanceMeters =
      gps && destination
        ? this.calculateDistance(
            gps.lat,
            gps.lng,
            destination.lat,
            destination.lng,
          )
        : undefined;
    const geofenceRadius = this.readNumber(body?.geofenceRadiusMeters, 180);
    const geofenceValidated =
      !options.requireGeofence ||
      !destination ||
      (distanceMeters !== undefined && distanceMeters <= geofenceRadius);
    const fraud = await this.fraudService.analyzeLocationEvent(
      {
        ...body,
        orderId: order.id,
        professionalId: this.readString(actor?.userId ?? body?.professionalId),
        lat: gps?.lat,
        lng: gps?.lng,
        accuracy: gps?.accuracy,
        speed: gps?.speed,
        distanceMeters,
        requiresGeofence: options.requireGeofence,
        geofenceValidated,
        destinationMissing: !destination,
        eventType: options.requireGeofence
          ? 'CHECK_IN_ATTEMPT'
          : 'MISSION_START',
      },
      actor,
    );

    if (!paymentConfirmed) {
      return {
        success: false,
        allowed: false,
        error: 'PAYMENT_NOT_CONFIRMED',
        message: 'Pagamento protegido ainda não confirmado.',
        fraud,
      };
    }

    if (!addressValid) {
      return {
        success: false,
        allowed: false,
        error: 'INVALID_ADDRESS',
        message: 'Endereço do atendimento obrigatorio para iniciar a missao.',
        fraud,
      };
    }

    if (!gps) {
      return {
        success: false,
        allowed: false,
        error: 'GPS_REQUIRED',
        message: 'Ative sua localizacao para iniciar a missao.',
        fraud,
      };
    }

    if (options.requireGeofence && destination && !geofenceValidated) {
      await this.auditOrder('MISSION_GEOFENCE_REJECTED', order, {
        actorId: this.readString(actor?.userId),
        ...body,
        distanceMeters,
        geofenceRadius,
        fraudRisk: fraud,
      });

      return {
        success: false,
        allowed: false,
        error: 'GEOFENCE_REQUIRED',
        message: 'Voce ainda não chegou ao local do serviço.',
        distanceMeters,
        geofenceRadiusMeters: geofenceRadius,
        fraud,
      };
    }

    if (options.requireGeofence && !destination) {
      await this.auditOrder('MISSION_GEOFENCE_COORDS_MISSING', order, {
        actorId: this.readString(actor?.userId),
        ...body,
        fraudRisk: fraud,
      });
    }

    return {
      success: true,
      allowed: true,
      location: gps,
      destination,
      distanceMeters,
      geofenceRadiusMeters: geofenceRadius,
      geofenceValidated,
      etaMinutes: this.readOptionalNumber(body?.etaMinutes ?? body?.eta),
      fraud,
    };
  }

  private async recordTrackingEvent(
    orderId: string,
    actor: any,
    body: any,
    status: string,
    metadata: Record<string, any> = {},
  ) {
    const gps = this.readGps(body);

    if (!gps) {
      return null;
    }

    const actorId = this.readString(
      body?.professionalId ?? actor?.userId ?? actor?.id,
    );

    const event = await this.prisma.trackingEvent
      .create({
        data: {
          orderId,
          actorId,
          lat: gps.lat,
          lng: gps.lng,
          status,
          metadata: JSON.stringify({
            accuracy: gps.accuracy,
            speed: gps.speed,
            heading: gps.heading,
            deviceId: this.readString(body?.deviceId),
            source: this.readString(body?.source) ?? 'app',
            createdAt: new Date().toISOString(),
            ...metadata,
          }),
        },
      })
      .catch(() => null);

    RealtimeGateway.emitOperational('location-update', {
      orderId,
      professionalId: actorId,
      lat: gps.lat,
      lng: gps.lng,
      accuracy: gps.accuracy,
      speed: gps.speed,
      status,
      routeProgress: metadata.routeProgress,
      eta: metadata.eta,
      distanceMeters: metadata.distanceMeters,
      timestamp: new Date().toISOString(),
    });

    return event;
  }

  private async safeTimeline(
    orderId: string,
    type: string,
    data: Record<string, any>,
  ) {
    try {
      return await this.timelineService.createEvent({
        orderId,
        type,
        ...data,
      });
    } catch {
      return null;
    }
  }

  private buildMissionPayload(
    order: OperationalOrder,
    validation: any,
    status: string,
  ) {
    return {
      orderId: order.id,
      status,
      paymentConfirmed: true,
      gpsRequired: true,
      address: order.address,
      location: validation.location,
      destination: validation.destination,
      distanceMeters: validation.distanceMeters,
      geofenceRadiusMeters: validation.geofenceRadiusMeters,
      geofenceValidated: validation.geofenceValidated,
      etaMinutes: validation.etaMinutes,
      route: this.googleMapsRoute(validation.location, validation.destination),
      tracking: {
        realtime: true,
        gpsRequired: true,
        geofenceRequired: true,
        etaVisual: true,
      },
      confirmation: {
        control: 'slide_to_confirm',
        label:
          status === 'CHECKED_IN'
            ? 'Arraste para confirmar chegada'
            : 'Arraste para iniciar missão',
        haptic: true,
      },
      push: {
        eventType: status === 'CHECKED_IN' ? 'CHECK_IN' : status,
        clientMessage:
          status === 'CHECKED_IN'
            ? 'Seu profissional chegou.'
            : 'Atualização da missão em tempo real.',
      },
      fraudFlag: validation.fraud?.fraudFlag ?? 'LOW',
      updatedAt: new Date().toISOString(),
    };
  }

  private readGps(body: any) {
    const lat = this.readOptionalNumber(
      body?.lat ?? body?.latitude ?? body?.currentLat,
    );
    const lng = this.readOptionalNumber(
      body?.lng ?? body?.longitude ?? body?.currentLng,
    );

    if (lat === undefined || lng === undefined) {
      return undefined;
    }

    return {
      lat,
      lng,
      accuracy: this.readOptionalNumber(body?.accuracy),
      speed: this.readOptionalNumber(body?.speed),
      heading: this.readOptionalNumber(body?.heading),
    };
  }

  private resolveDestination(body: any) {
    const lat = this.readOptionalNumber(
      body?.destinationLat ?? body?.destination?.lat,
    );
    const lng = this.readOptionalNumber(
      body?.destinationLng ?? body?.destination?.lng,
    );

    if (lat === undefined || lng === undefined) {
      return undefined;
    }

    return { lat, lng };
  }

  private googleMapsRoute(origin?: any, destination?: any) {
    if (!destination) {
      return undefined;
    }

    const destinationParam = `${destination.lat},${destination.lng}`;
    const originParam = origin ? `${origin.lat},${origin.lng}` : undefined;
    const query = originParam
      ? `origin=${encodeURIComponent(originParam)}&destination=${encodeURIComponent(
          destinationParam,
        )}`
      : `destination=${encodeURIComponent(destinationParam)}`;

    return `https://www.google.com/maps/dir/?api=1&${query}`;
  }

  private async hasConfirmedPayment(orderId: string) {
    if (this.paymentConfirmedOrders.has(orderId)) {
      return true;
    }

    try {
      const status = await this.paymentsService.getOrderStatus(orderId);
      const paymentStatus = this.readString(status?.status)?.toUpperCase();
      const escrowStatus = this.readString(status?.escrowStatus)?.toUpperCase();

      if (
        !paymentStatus ||
        !['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(
          paymentStatus,
        )
      ) {
        return false;
      }

      return !escrowStatus || ['HELD', 'RELEASED'].includes(escrowStatus);
    } catch {
      return false;
    }
  }

  private async tryCreatePersistedOrder(data: any) {
    const clientId = this.readString(data?.clientId);

    if (!clientId) {
      return null;
    }

    try {
      const order = await this.prisma.serviceOrder.create({
        data: {
          id: this.normalizeId(data?.id),
          clientId,
          professionalId: this.readString(data?.professionalId),
          category: this.readString(data?.category),
          address: this.readString(data?.address),
          title:
            this.readString(data?.title ?? data?.serviceTitle) ||
            'Servico BoraServico',
          description: this.readString(data?.description) || '',
          price: this.readNumber(data?.estimatedPrice ?? data?.price, 189.9),
          status: 'CREATED',
        },
        include: this.orderReadInclude(),
      });

      return this.fromPrismaOrder(order);
    } catch {
      return null;
    }
  }

  private async tryFindPersistedOrders() {
    try {
      const orders = await this.prisma.serviceOrder.findMany({
        include: this.orderReadInclude(),
        orderBy: {
          createdAt: 'desc',
        },
      });

      return orders.map((order) => this.fromPrismaOrder(order));
    } catch {
      return null;
    }
  }

  private async tryFindPersistedOrder(id?: string) {
    const orderId = this.normalizeId(id);

    if (!orderId) {
      return null;
    }

    try {
      const order = await this.prisma.serviceOrder.findUnique({
        where: { id: orderId },
        include: this.orderReadInclude(),
      });

      return order ? this.fromPrismaOrder(order) : null;
    } catch {
      return null;
    }
  }

  private async tryUpdatePersistedOrder(id: string, data: Record<string, any>) {
    const orderId = this.normalizeId(id);

    if (!orderId) {
      return null;
    }

    try {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );

      const order = await this.prisma.serviceOrder.update({
        where: { id: orderId },
        data: cleanData,
        include: this.orderReadInclude(),
      });

      return this.fromPrismaOrder(order);
    } catch {
      return null;
    }
  }

  private fromPrismaOrder(order: any): OperationalOrder {
    const latestPayment = Array.isArray(order.payments)
      ? order.payments[0]
      : undefined;

    return {
      id: order.id,
      serviceId: 50,
      clientId: order.clientId,
      professionalId: order.professionalId ?? undefined,
      professionalName: this.readString(order.professional?.name),
      professionalEmail: this.readString(order.professional?.email),
      clientName: this.readString(order.client?.name),
      clientEmail: this.readString(order.client?.email),
      title: this.cleanText(order.title),
      description: this.cleanText(order.description),
      category: this.readString(order.category),
      address: this.readString(order.address),
      estimatedPrice: this.readNumber(order.price, 0),
      status: this.normalizeStatus(order.status),
      paymentConfirmed: this.prismaOrderPaymentConfirmed(order),
      protectedPaymentStatus: this.readString(latestPayment?.status),
      escrowStatus: this.readString(
        latestPayment?.escrowStatus ?? order.escrow?.status,
      ),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt ?? order.createdAt,
      acceptedAt: order.acceptedAt ?? undefined,
      startedAt: order.startedAt ?? undefined,
      checkInAt: order.checkInAt ?? undefined,
      checkOutAt: order.checkOutAt ?? undefined,
      completedAt: order.completedAt ?? undefined,
      cancelledAt: order.cancelledAt ?? undefined,
    };
  }

  private orderReadInclude() {
    return {
      client: { select: { id: true, name: true, email: true } },
      professional: { select: { id: true, name: true, email: true } },
      escrow: true,
      payments: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    };
  }

  private prismaOrderPaymentConfirmed(order: any) {
    const latestPayment = Array.isArray(order.payments)
      ? order.payments[0]
      : undefined;
    const status = this.readString(latestPayment?.status)?.toUpperCase();
    const escrowStatus = this.readString(
      latestPayment?.escrowStatus ?? order.escrow?.status,
    )?.toUpperCase();

    if (!status || !['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(status)) {
      return false;
    }

    return !escrowStatus || ['HELD', 'RELEASED'].includes(escrowStatus);
  }

  private ensureOrder(id?: string) {
    const orderId = this.normalizeId(id) || 'BS-0505-OP';
    const existing = this.orders.get(orderId);

    if (existing) {
      return existing;
    }

    const now = new Date();
    const order: OperationalOrder = {
      id: orderId,
      serviceId: 50,
      title: 'Atendimento operacional premium',
      description: '',
      estimatedPrice: 189.9,
      status: 'CREATED',
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);
    return order;
  }

  private emitStatus(
    order: OperationalOrder,
    eventName: string,
    status: OrderStatus,
  ) {
    RealtimeGateway.emitOperational(eventName, {
      ...this.toEventPayload(order),
      status,
      message: `Status atualizado para ${status}`,
    });
  }

  private emitOrderEvent(
    order: OperationalOrder,
    eventName: string,
    message: string,
  ) {
    RealtimeGateway.emitOperational(eventName, {
      ...this.toEventPayload(order),
      message,
    });
  }

  private emitPaymentReleased(order: OperationalOrder) {
    const protectedAmount = order.estimatedPrice;
    const platformFee = this.roundCurrency(
      protectedAmount * this.platformCommissionRate,
    );
    const releasedAmount = protectedAmount;

    RealtimeGateway.emitOperational('payment-released', {
      ...this.toEventPayload(order),
      balance: protectedAmount,
      escrow: 0,
      protectedAmount,
      platformFee,
      releasedAmount,
      statusLabel: 'Pagamento liberado com protecao',
      message: 'Pagamento liberado para repasse',
    });
  }

  private pushEvent(
    eventType:
      | 'ORDER_CREATED'
      | 'PROFESSIONAL_FOUND'
      | 'PROPOSAL_RECEIVED'
      | 'PROPOSAL_ACCEPTED'
      | 'DISPLACEMENT_STARTED'
      | 'PROFESSIONAL_ON_THE_WAY'
      | 'CHECK_IN'
      | 'PAYMENT_APPROVED'
      | 'PAYMENT_CONFIRMED'
      | 'CONTACT_RELEASED'
      | 'PAYMENT_RELEASED'
      | 'PROFESSIONAL_NEARBY'
      | 'SERVICE_STARTED'
      | 'SERVICE_IN_PROGRESS'
      | 'SERVICE_FINISHED'
      | 'PROOF_UPLOADED'
      | 'SERVICE_COMPLETED',
    order: OperationalOrder,
  ) {
    void this.pushRealService
      .notifyOrderEvent(eventType, this.toEventPayload(order))
      .catch(() => undefined);
  }

  private toEventPayload(order: OperationalOrder) {
    return {
      orderId: order.id,
      id: order.id,
      serviceId: order.serviceId,
      serviceTitle: order.title,
      title: order.title,
      estimatedPrice: order.estimatedPrice,
      clientId: order.clientId,
      professionalId: order.professionalId,
      professionalName: this.readString(order.professionalName),
      specialty: 'Especialista Bora',
      rating: 4.96,
      timestamp: order.updatedAt.toISOString(),
    };
  }

  private toPublicOrder(order: OperationalOrder) {
    const contactUnlocked = this.isProtectedFlowUnlocked(order);
    const safeAddress = this.protectedAddress(order.address);
    const fullAddress = this.cleanText(order.address);

    return {
      success: true,
      id: order.id,
      orderId: order.id,
      serviceId: order.serviceId,
      serviceTitle: this.cleanText(order.title),
      title: this.cleanText(order.title),
      description: this.cleanText(order.description),
      category: this.cleanText(order.category),
      address: contactUnlocked && fullAddress ? fullAddress : safeAddress,
      protectedAddress: safeAddress,
      fullAddress: contactUnlocked ? fullAddress : undefined,
      contactUnlocked,
      protectedUntilPayment: !contactUnlocked,
      routeUnlocked: contactUnlocked,
      trackingUnlocked: contactUnlocked,
      paymentConfirmed: contactUnlocked,
      protectedPaymentStatus: order.protectedPaymentStatus,
      escrowStatus: order.escrowStatus,
      status: order.status,
      clientId: order.clientId,
      professionalId: order.professionalId,
      professionalName: this.readString(order.professionalName),
      estimatedPrice: order.estimatedPrice,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      acceptedAt: order.acceptedAt?.toISOString(),
      startedAt: order.startedAt?.toISOString(),
      checkInAt: order.checkInAt?.toISOString(),
      checkOutAt: order.checkOutAt?.toISOString(),
      completedAt: order.completedAt?.toISOString(),
      cancelledAt: order.cancelledAt?.toISOString(),
    };
  }

  private isProtectedFlowUnlocked(order: OperationalOrder) {
    if (order.paymentConfirmed || this.paymentConfirmedOrders.has(order.id)) {
      return true;
    }

    if (
      ['IN_PROGRESS', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(
        order.status,
      )
    ) {
      return true;
    }

    const paymentStatus = this.readString(order.protectedPaymentStatus)
      ?.toUpperCase()
      .trim();
    const escrowStatus = this.readString(order.escrowStatus)
      ?.toUpperCase()
      .trim();

    if (
      paymentStatus &&
      ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(paymentStatus)
    ) {
      return !escrowStatus || ['HELD', 'RELEASED'].includes(escrowStatus);
    }

    return false;
  }

  private normalizeId(value: any) {
    return this.readString(value);
  }

  private isVisibleProductionOrder(order: OperationalOrder) {
    const staleDraft =
      ['CREATED', 'MATCHING'].includes(order.status) &&
      Date.now() - order.createdAt.getTime() > 24 * 60 * 60 * 1000;

    if (staleDraft) {
      return false;
    }

    return !containsOperationalResidue(
      [
        order.id,
        order.title,
        order.description,
        order.category,
        order.address,
        order.professionalName,
      ].join(' '),
    );
  }

  private readString(value: any) {
    const text = repairLegacyEncoding(value)?.trim();
    return text && text.length > 0 ? text : undefined;
  }

  private cleanText(value: any) {
    return this.readString(value) ?? '';
  }

  private readNumber(value: any, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private readOptionalNumber(value: any) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ) {
    const radiusMeters = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(radiusMeters * c);
  }

  private toRad(value: number) {
    return (value * Math.PI) / 180;
  }

  private normalizeStatus(value: any): OrderStatus {
    const status = this.readString(value)?.toUpperCase();

    if (status === 'CANCELED') {
      return 'CANCELLED';
    }

    const allowed: OrderStatus[] = [
      'CREATED',
      'MATCHING',
      'ACCEPTED',
      'IN_PROGRESS',
      'CHECKED_IN',
      'CHECKED_OUT',
      'COMPLETED',
      'CANCELLED',
    ];

    return allowed.includes(status as OrderStatus)
      ? (status as OrderStatus)
      : 'CREATED';
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private visibleProposalBadges(source: any) {
    const raw = Array.isArray(source?.visibleBadges)
      ? source.visibleBadges
      : Array.isArray(source?.badges)
        ? source.badges
        : [];
    const badges = raw
      .map((item: any) => this.readString(item))
      .filter(Boolean) as string[];

    const normalized = [
      ...badges,
      'Boa opção para o serviço',
      'Disponível para atendimento',
    ].filter((item, index, list) => list.indexOf(item) === index);

    return normalized.slice(0, 4);
  }

  private async scoreOrder(order: OperationalOrder, data: any) {
    try {
      return await this.fraudService.analyzeOrder(
        {
          ...data,
          orderId: order.id,
          clientId: order.clientId,
          professionalId: order.professionalId,
          title: order.title,
          address: order.address,
          amount: order.estimatedPrice,
        },
        {
          userId: order.clientId,
        },
      );
    } catch {
      return undefined;
    }
  }

  private async auditOrder(
    action: string,
    order: OperationalOrder,
    data: any = {},
    fraudRisk?: any,
  ) {
    await this.auditService.register(action, {
      domain: 'orders',
      actorId: this.readString(
        data?.actorId ?? data?.clientId ?? order.clientId,
      ),
      entityType: 'order',
      entityId: order.id,
      orderId: order.id,
      amount: order.estimatedPrice,
      metadata: {
        status: order.status,
        professionalId: order.professionalId,
        fraudRisk: this.publicFraudRisk(fraudRisk),
      },
    });
  }

  private withFraudRisk(order: Record<string, any>, fraudRisk?: any) {
    return {
      ...order,
      fraudRisk: this.publicFraudRisk(fraudRisk),
    };
  }

  private publicFraudRisk(fraudRisk?: any) {
    if (!fraudRisk) {
      return undefined;
    }

    return {
      score: fraudRisk.riskScore ?? fraudRisk.score,
      level: fraudRisk.riskLevel ?? fraudRisk.level,
      approved: fraudRisk.approved,
      reasons: fraudRisk.reasons,
    };
  }

  private async releasePaymentForOrder(orderId: string) {
    try {
      return await this.paymentsService.releaseForOrder(orderId);
    } catch (error) {
      return {
        success: false,
        released: false,
        orderId,
        error: 'PAYMENT_RELEASE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao liberar pagamento da ordem',
      };
    }
  }
}
