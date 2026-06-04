import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  containsOperationalResidue,
  repairLegacyEncoding,
} from '../security/contact-filter';

type DispatchStatus =
  | 'SEARCHING'
  | 'WAITING_RESPONSES'
  | 'PROPOSAL_RECEIVED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

type WaveStatus =
  | 'PLANNED'
  | 'SENT'
  | 'WAITING'
  | 'EXPANDED'
  | 'DONE'
  | 'EXPIRED';

interface ProfessionalProfile {
  id: string;
  name: string;
  category: string;
  specialties: string[];
  modalities: string[];
  rating: number;
  distanceKm: number;
  neighborhood: string;
  city: string;
  online: boolean;
  available: boolean;
  responseMinutes: number;
  acceptanceRate: number;
  cancellationRate: number;
  completedServices: number;
  averagePrice: number;
  riskScore: number;
  priority: number;
}

interface MatchingRequest {
  orderId: string;
  category: string;
  modality: string;
  neighborhood?: string;
  city?: string;
  radiusKm: number;
  urgency: string;
  targetPrice: number;
}

interface ScoreBreakdown {
  compatibility: number;
  specialty: number;
  reputation: number;
  distance: number;
  response: number;
  urgency: number;
  value: number;
  risk: number;
  availability: number;
  conversion: number;
  finalScore: number;
}

interface ScoredProfessional {
  profile: ProfessionalProfile;
  score: ScoreBreakdown;
  visibleBadges: string[];
  headline: string;
}

interface DispatchWave {
  id: string;
  number: number;
  label: string;
  radiusKm: number;
  status: WaveStatus;
  professionals: ScoredProfessional[];
  sentAt?: Date;
  expiresAt?: Date;
}

interface MatchingProposal {
  id: string;
  orderId: string;
  professionalId: string;
  professionalName: string;
  amount: number;
  deadline: string;
  etaMinutes: number;
  note: string;
  visibleBadges: string[];
  conversionMessage: string;
  createdAt: Date;
  expiresAt: Date;
}

interface DispatchMock {
  id: string;
  orderId: string;
  category: string;
  modality: string;
  city?: string;
  neighborhood?: string;
  status: DispatchStatus;
  radiusKm: number;
  currentWave: number;
  responseWindowSeconds: number;
  waves: DispatchWave[];
  proposals: MatchingProposal[];
  selectedProfessionalId?: string;
  timeline: Array<{
    status: string;
    message: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class MatchingService {
  private readonly responseWindowSeconds = 15 * 60;
  private readonly maxProfessionalsPerRequest = 3;
  private readonly spamCooldownMs = 10 * 60 * 1000;
  private readonly lastDispatchByProfessional = new Map<string, Date>();

  private dispatches: DispatchMock[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
  ) {}

  private normalizeCategory(category?: string): string {
    return (category ?? 'elétrica')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  async listProfessionals(): Promise<any[]> {
    const request = this.toRequest({});
    const professionals = await this.loadProfessionals(request);

    return professionals
      .map((profile) => this.scoreProfessional(request, profile))
      .sort((a, b) => b.score.finalScore - a.score.finalScore)
      .map((candidate) => this.toPublicProfessional(candidate));
  }

  async findCompatibleProfessionals(data: any, limit = 3): Promise<any[]> {
    const request = this.toRequest({
      ...data,
      targetPrice: 0,
      estimatedPrice: 0,
      price: 0,
    });
    const max = Math.max(1, Math.min(limit, this.maxProfessionalsPerRequest));
    const candidates = await this.loadProfessionals(request);
    const scored = candidates
      .map((profile) => this.scoreProfessional(request, profile))
      .sort((a, b) => b.score.finalScore - a.score.finalScore);

    const available = scored.filter(
      (candidate) =>
        candidate.score.availability >= 50 &&
        candidate.profile.available &&
        candidate.profile.online,
    );

    // Produção: prioriza disponíveis/online, mas preenche até 3 com os
    // melhores compatíveis restantes quando há poucos profissionais online.
    // Isso evita o cliente ver apenas 1 opção quando existem profissionais
    // compatíveis cadastrados, sem criar dados falsos.
    const selected = [...available];

    for (const candidate of scored) {
      if (selected.length >= max) {
        break;
      }

      if (
        !selected.some(
          (item) => item.profile.id === candidate.profile.id,
        ) &&
        candidate.score.finalScore >= 45
      ) {
        selected.push(candidate);
      }
    }

    return selected
      .slice(0, max)
      .map((candidate) => this.toPublicProfessional(candidate));
  }

  listDispatches(): any[] {
    this.expireStaleDispatches();
    return this.dispatches.map((dispatch) => this.toPublicDispatch(dispatch));
  }

  findDispatch(id: string) {
    this.expireStaleDispatches();
    const dispatch = this.dispatches.find(
      (item) => item.id === id || item.orderId === id,
    );

    return dispatch ? this.toPublicDispatch(dispatch) : undefined;
  }

  async dispatch(data: any): Promise<any> {
    const request = this.toRequest(data);
    const candidates = await this.loadProfessionals(request);
    const scored = candidates
      .map((profile) => this.scoreProfessional(request, profile))
      .filter((candidate) => candidate.score.availability >= 50)
      .sort((a, b) => b.score.finalScore - a.score.finalScore);

    const waves = this.buildWaves(request, scored);
    const firstWave = waves[0];
    const now = new Date();
    const expiresAt = this.addSeconds(now, this.responseWindowSeconds);

    if (firstWave) {
      firstWave.status = 'WAITING';
      firstWave.sentAt = now;
      firstWave.expiresAt = expiresAt;
      firstWave.professionals.forEach((candidate) =>
        this.lastDispatchByProfessional.set(candidate.profile.id, now),
      );
    }

    const dispatch: DispatchMock = {
      id: randomUUID(),
      orderId: request.orderId,
      category: request.category,
      modality: request.modality,
      city: request.city,
      neighborhood: request.neighborhood,
      radiusKm: request.radiusKm,
      status: firstWave ? 'WAITING_RESPONSES' : 'SEARCHING',
      currentWave: firstWave?.number ?? 0,
      responseWindowSeconds: this.responseWindowSeconds,
      waves,
      proposals: this.proposalsFromWave(request, firstWave),
      timeline: [
        {
          status: 'SEARCHING',
          message: 'Buscando profissionais disponiveis',
          createdAt: now,
        },
        {
          status: 'SENDING',
          message: firstWave
            ? 'Enviando solicitacao'
            : 'Ajustando busca para encontrar uma boa opção',
          createdAt: now,
        },
        {
          status: 'WAITING',
          message: firstWave
            ? 'Aguardando respostas'
            : 'Buscando profissionais disponiveis',
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.dispatches.push(dispatch);
    this.emitDispatchEvent(dispatch, 'matching-dispatched');
    this.notifyProfessionals(dispatch, firstWave);

    return this.toPublicDispatch(dispatch);
  }

  expand(data: any): any {
    const dispatch = this.dispatches.find(
      (item) =>
        item.id === data?.dispatchId ||
        item.orderId === data?.dispatchId ||
        item.orderId === data?.orderId,
    );

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Busca não encontrada',
      };
    }

    const nextWave = dispatch.waves.find(
      (wave) => wave.number === dispatch.currentWave + 1,
    );

    if (!nextWave) {
      dispatch.status = 'EXPIRED';
      dispatch.updatedAt = new Date();
      dispatch.timeline.push({
        status: 'EXPIRED',
        message: 'Nenhum profissional respondeu dentro do prazo',
        createdAt: dispatch.updatedAt,
      });
      return this.toPublicDispatch(dispatch);
    }

    const now = new Date();
    nextWave.status = 'EXPANDED';
    nextWave.sentAt = now;
    nextWave.expiresAt = this.addSeconds(now, this.responseWindowSeconds);
    nextWave.professionals.forEach((candidate) =>
      this.lastDispatchByProfessional.set(candidate.profile.id, now),
    );
    dispatch.currentWave = nextWave.number;
    dispatch.expiresAt = nextWave.expiresAt;
    dispatch.status = 'WAITING_RESPONSES';
    dispatch.updatedAt = now;
    dispatch.timeline.push({
      status: 'EXPANDED',
      message:
        nextWave.number >= 3
          ? 'Busca ampliada para uma regiao maior'
          : 'Nova onda enviada para mais profissionais',
      createdAt: now,
    });

    this.emitDispatchEvent(dispatch, 'matching-expanded');
    this.notifyProfessionals(dispatch, nextWave);

    return this.toPublicDispatch(dispatch);
  }

  cancel(data: any): any {
    const dispatch = this.dispatches.find(
      (item) =>
        item.id === data?.dispatchId ||
        item.orderId === data?.dispatchId ||
        item.orderId === data?.orderId,
    );

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Busca não encontrada',
      };
    }

    dispatch.status = 'CANCELLED';
    dispatch.updatedAt = new Date();
    dispatch.timeline.push({
      status: 'CANCELLED',
      message: 'Busca cancelada pelo cliente',
      createdAt: dispatch.updatedAt,
    });
    this.emitDispatchEvent(dispatch, 'matching-cancelled');

    return this.toPublicDispatch(dispatch);
  }

  receiveProposal(data: any): any {
    const dispatch = this.dispatches.find(
      (item) =>
        item.id === data?.dispatchId ||
        item.orderId === data?.dispatchId ||
        item.orderId === data?.orderId,
    );

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Busca não encontrada',
      };
    }

    const professionalId = this.readString(data?.professionalId);
    const currentWave = dispatch.waves.find(
      (wave) => wave.number === dispatch.currentWave,
    );
    const candidate = currentWave?.professionals.find(
      (item) => item.profile.id === professionalId,
    );
    const amount = this.readNumber(data?.amount ?? data?.value, 0);
    const now = new Date();

    if (amount <= 0) {
      return {
        error: 'INVALID_PROPOSAL_AMOUNT',
        message: 'O valor precisa ser informado pelo profissional.',
      };
    }

    const resolvedProfessionalId = professionalId ?? candidate?.profile.id;
    const resolvedProfessionalName =
      this.readString(data?.professionalName ?? data?.name) ??
      candidate?.profile.name;

    if (!resolvedProfessionalId || !resolvedProfessionalName) {
      return {
        error: 'PROFESSIONAL_REQUIRED',
        message: 'Proposta exige um profissional real identificado.',
      };
    }

    const proposal: MatchingProposal = {
      id: this.readString(data?.id) ?? randomUUID(),
      orderId: dispatch.orderId,
      professionalId: resolvedProfessionalId,
      professionalName: resolvedProfessionalName,
      amount: this.roundCurrency(amount),
      deadline:
        this.readString(data?.deadline) ??
        this.availabilityLabel(candidate?.profile),
      etaMinutes: this.readNumber(data?.etaMinutes ?? data?.eta, 12),
      note:
        this.readString(data?.note) ??
        'Proposta clara, com contato protegido até o pagamento.',
      visibleBadges: candidate?.visibleBadges ?? ['Profissional verificado'],
      conversionMessage:
        this.readString(data?.conversionMessage) ??
        this.conversionMessage(candidate),
      createdAt: now,
      expiresAt: this.addSeconds(now, this.responseWindowSeconds),
    };

    dispatch.proposals = [proposal, ...dispatch.proposals];
    dispatch.status = 'PROPOSAL_RECEIVED';
    dispatch.updatedAt = now;
    dispatch.timeline.push({
      status: 'PROPOSAL_RECEIVED',
      message: 'Nova proposta recebida',
      createdAt: now,
    });
    this.emitDispatchEvent(dispatch, 'proposal-received');
    void this.pushRealService
      .notifyOrderEvent('PROPOSAL_RECEIVED', {
        orderId: dispatch.orderId,
        professionalId: proposal.professionalId,
        message: 'Nova proposta recebida',
      })
      .catch(() => undefined);

    return this.toPublicDispatch(dispatch);
  }

  accept(data: any): any {
    const dispatch = this.dispatches.find(
      (item) =>
        item.id === data?.dispatchId ||
        item.orderId === data?.dispatchId ||
        item.orderId === data?.orderId,
    );

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Busca não encontrada',
      };
    }

    const selectedProfessionalId =
      this.readString(data?.professionalId) ??
      this.readString(dispatch.proposals[0]?.professionalId);

    if (!selectedProfessionalId) {
      return {
        error: 'PROFESSIONAL_REQUIRED',
        message: 'Aceite exige um profissional real selecionado.',
      };
    }

    dispatch.status = 'ACCEPTED';
    dispatch.selectedProfessionalId = selectedProfessionalId;
    dispatch.updatedAt = new Date();
    dispatch.timeline.push({
      status: 'ACCEPTED',
      message: 'Encontramos uma boa opção',
      createdAt: dispatch.updatedAt,
    });

    const payload = {
      orderId: dispatch.orderId,
      professionalId: dispatch.selectedProfessionalId,
      category: dispatch.category,
      message: 'Profissional encontrado',
      timestamp: dispatch.updatedAt.toISOString(),
    };

    RealtimeGateway.emitOperational('match-found', payload);
    void this.pushRealService
      .notifyOrderEvent('PROFESSIONAL_FOUND', payload)
      .catch(() => undefined);

    return this.toPublicDispatch(dispatch);
  }

  reject(data: any): any {
    const dispatch = this.dispatches.find(
      (item) =>
        item.id === data?.dispatchId ||
        item.orderId === data?.dispatchId ||
        item.orderId === data?.orderId,
    );

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Busca não encontrada',
      };
    }

    dispatch.status = 'REJECTED';
    dispatch.updatedAt = new Date();
    dispatch.timeline.push({
      status: 'REJECTED',
      message: 'Profissional recusou a solicitacao',
      createdAt: dispatch.updatedAt,
    });

    return this.toPublicDispatch(dispatch);
  }

  private async loadProfessionals(
    request: MatchingRequest,
  ): Promise<ProfessionalProfile[]> {
    const dbProfessionals = await this.loadDatabaseProfessionals(request).catch(
      () => [],
    );

    if (dbProfessionals.length > 0) {
      return dbProfessionals;
    }

    return [];
  }

  private async loadDatabaseProfessionals(
    request: MatchingRequest,
  ): Promise<ProfessionalProfile[]> {
    const specialtyLookup = await this.loadProfessionalSpecialtyAudit();
    const users = await this.prisma.user.findMany({
      where: {
        role: {
          in: ['PROFESSIONAL'],
        },
      },
      take: 200,
      include: {
        reputationProfile: true,
        acceptedOrders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            category: true,
            title: true,
            status: true,
            price: true,
            createdAt: true,
            acceptedAt: true,
            cancelledAt: true,
            address: true,
          },
        },
      },
    });

    return users
      .filter((user) => this.isVisibleProductionUser(user))
      .map((user, index) => {
        const orders = user.acceptedOrders ?? [];
        const completed =
          user.reputationProfile?.completedServices ??
          orders.filter((order) => order.status === 'COMPLETED').length;
        const cancelled =
          user.reputationProfile?.cancelledServices ??
          orders.filter((order) =>
            ['CANCELED', 'CANCELLED'].includes(order.status),
          ).length;
        const categories = orders
          .map((order) => this.normalizeCategory(order.category ?? undefined))
          .filter(Boolean);
        const auditProfile = specialtyLookup.get(user.id);
        const auditCategory = auditProfile?.category
          ? this.normalizeCategory(auditProfile.category)
          : undefined;
        const category = auditCategory || categories[0] || request.category;
        const auditedSpecialties =
          auditProfile?.specialties
            ?.map((item) => this.readString(item))
            .filter(Boolean) ?? [];
        const responseMinutes =
          this.averageResponseMinutes(orders) ??
          Math.max(
            6,
            Math.round(
              (100 - (user.reputationProfile?.responseTimeScore ?? 84)) / 2 + 6,
            ),
          );
        const averagePrice =
          this.averagePrice(orders) ?? (request.targetPrice || 180);
        const reliability = user.reputationProfile?.reliabilityScore ?? 86;
        const cancellationRate =
          completed + cancelled > 0
            ? cancelled / (completed + cancelled)
            : 0.04;

        return {
          id: user.id,
          name: user.name,
          category,
          specialties: this.unique([
            ...(auditedSpecialties as string[]),
            ...orders
              .map((order) => this.readString(order.title))
              .filter(Boolean),
            category,
          ]) as string[],
          modalities: this.unique([
            ...(auditedSpecialties as string[]),
            ...orders
              .map((order) => this.readString(order.title))
              .filter(Boolean),
            request.modality,
          ]) as string[],
          rating: user.reputationProfile?.averageRating ?? 4.82,
          distanceKm: this.syntheticDistance(user.id, index),
          neighborhood:
            this.extractNeighborhood(orders[0]?.address) ??
            request.neighborhood ??
            'Região ativa',
          city: request.city ?? 'Cidade atendida',
          online: true,
          available: true,
          responseMinutes,
          acceptanceRate: Math.min(0.96, Math.max(0.58, reliability / 100)),
          cancellationRate,
          completedServices: completed,
          averagePrice: Number(averagePrice),
          riskScore: Math.min(
            98,
            Math.max(58, reliability - cancellationRate * 120),
          ),
          priority: Math.round(user.reputationProfile?.reputationScore ?? 82),
        };
      });
  }

  private async loadProfessionalSpecialtyAudit() {
    const result = new Map<
      string,
      { category?: string; specialties: string[] }
    >();

    try {
      const audits = await this.prisma.paymentAudit.findMany({
        where: { action: 'PROFESSIONAL_SPECIALTIES_REGISTERED' },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      for (const audit of audits) {
        const metadata = this.readObject(audit.metadata);
        const userId = this.readString(metadata.entityId ?? metadata.actorId);

        if (!userId || result.has(userId)) {
          continue;
        }

        const nested = this.readObject(metadata.metadata);
        const category = this.readString(
          nested.professionalCategory ?? metadata.professionalCategory,
        );
        const rawSpecialties =
          nested.professionalSpecialties ?? metadata.professionalSpecialties;
        const specialties = Array.isArray(rawSpecialties)
          ? rawSpecialties
              .map((item) => this.readString(item))
              .filter((item): item is string => Boolean(item))
          : [];

        result.set(userId, { category, specialties });
      }
    } catch {
      return result;
    }

    return result;
  }

  private buildWaves(
    request: MatchingRequest,
    scored: ScoredProfessional[],
  ): DispatchWave[] {
    const fresh = scored.filter(
      (candidate) =>
        !this.isInCooldown(candidate.profile.id) &&
        candidate.profile.online &&
        candidate.profile.available,
    );
    const primary = fresh.filter(
      (candidate) => candidate.profile.distanceKm <= request.radiusKm,
    );
    const secondary = fresh.filter(
      (candidate) =>
        candidate.profile.distanceKm <= request.radiusKm + 4 &&
        !primary.includes(candidate),
    );
    const expanded = fresh.filter(
      (candidate) =>
        candidate.profile.distanceKm <= Math.max(request.radiusKm * 2, 12) &&
        !primary.includes(candidate) &&
        !secondary.includes(candidate),
    );
    const overflow = fresh.filter(
      (candidate) =>
        !primary.includes(candidate) &&
        !secondary.includes(candidate) &&
        !expanded.includes(candidate),
    );

    const waves: DispatchWave[] = [
      {
        id: randomUUID(),
        number: 1,
        label: 'Primeira onda',
        radiusKm: request.radiusKm,
        status: 'PLANNED' as WaveStatus,
        professionals: primary.slice(0, this.maxProfessionalsPerRequest),
      },
      {
        id: randomUUID(),
        number: 2,
        label: 'Segunda onda',
        radiusKm: request.radiusKm + 4,
        status: 'PLANNED' as WaveStatus,
        professionals: [
          ...primary.slice(this.maxProfessionalsPerRequest),
          ...secondary,
        ].slice(0, this.maxProfessionalsPerRequest),
      },
      {
        id: randomUUID(),
        number: 3,
        label: 'Raio ampliado',
        radiusKm: Math.max(request.radiusKm * 2, 12),
        status: 'PLANNED' as WaveStatus,
        professionals: [...expanded, ...overflow].slice(
          0,
          this.maxProfessionalsPerRequest,
        ),
      },
    ];

    return waves.filter((wave) => wave.professionals.length > 0);
  }

  private scoreProfessional(
    request: MatchingRequest,
    profile: ProfessionalProfile,
  ): ScoredProfessional {
    const categoryMatch = profile.category === request.category;
    const normalizedModality = this.normalizeText(request.modality);
    const specialties = [...profile.specialties, ...profile.modalities].map(
      (item) => this.normalizeText(item),
    );
    const exactModality = specialties.some(
      (item) =>
        item === normalizedModality ||
        item.includes(normalizedModality) ||
        normalizedModality.includes(item),
    );
    const specialty = exactModality ? 98 : categoryMatch ? 86 : 62;
    const distance = this.clamp(100 - profile.distanceKm * 7, 45, 100);
    const response = this.clamp(
      100 - profile.responseMinutes * 2.4 + profile.acceptanceRate * 12,
      45,
      100,
    );
    const reputation = this.clamp(
      (profile.rating / 5) * 70 +
        profile.acceptanceRate * 16 +
        Math.min(profile.completedServices / 80, 14),
      48,
      100,
    );
    const risk = this.clamp(
      profile.riskScore - profile.cancellationRate * 90,
      40,
      100,
    );
    const availability = this.clamp(
      (profile.online ? 32 : 0) +
        (profile.available ? 34 : 0) +
        distance * 0.22 +
        (this.isInCooldown(profile.id) ? -24 : 8),
      0,
      100,
    );
    const urgencyBoost = this.normalizeText(request.urgency).includes('emerg')
      ? 6
      : this.normalizeText(request.urgency).includes('alta')
        ? 3
        : 0;
    const urgency = this.clamp(
      response * 0.55 + distance * 0.3 + urgencyBoost * 4,
      45,
      100,
    );
    const value = reputation;
    const conversion = this.clamp(
      specialty * 0.28 +
        response * 0.18 +
        reputation * 0.24 +
        risk * 0.16 +
        availability * 0.14,
      0,
      100,
    );
    const finalScore = this.clamp(
      specialty * 0.24 +
        reputation * 0.2 +
        distance * 0.16 +
        response * 0.16 +
        availability * 0.12 +
        urgency * 0.08 +
        risk * 0.08 +
        conversion * 0.08 +
        profile.priority * 0.04,
      0,
      100,
    );

    const score = {
      compatibility: Math.round(finalScore),
      specialty: Math.round(specialty),
      reputation: Math.round(reputation),
      distance: Math.round(distance),
      response: Math.round(response),
      urgency: Math.round(urgency),
      value: Math.round(value),
      risk: Math.round(risk),
      availability: Math.round(availability),
      conversion: Math.round(conversion),
      finalScore: Math.round(finalScore),
    };

    return {
      profile,
      score,
      visibleBadges: this.visibleBadges(score, profile),
      headline: this.headline(score),
    };
  }

  private proposalsFromWave(
    request: MatchingRequest,
    wave?: DispatchWave,
  ): MatchingProposal[] {
    void request;
    void wave;
    return [];
  }

  private toRequest(data: any): MatchingRequest {
    const category = this.normalizeCategory(
      data?.category ?? data?.categoryName ?? data?.serviceCategory,
    );
    const modality =
      this.readString(data?.modality ?? data?.serviceTitle ?? data?.title) ??
      category;

    return {
      orderId: this.readString(data?.orderId ?? data?.id) ?? randomUUID(),
      category,
      modality,
      neighborhood: this.readString(data?.neighborhood ?? data?.bairro),
      city: this.readString(data?.city ?? data?.cidade),
      radiusKm: this.readNumber(data?.radiusKm ?? data?.radius, 5),
      urgency: this.readString(data?.urgency ?? data?.urgencyClass) ?? 'Normal',
      targetPrice: this.readNumber(
        data?.targetPrice ?? data?.estimatedPrice ?? data?.price,
        0,
      ),
    };
  }

  private toPublicDispatch(dispatch: DispatchMock) {
    const currentWave = dispatch.waves.find(
      (wave) => wave.number === dispatch.currentWave,
    );

    return {
      id: dispatch.id,
      orderId: dispatch.orderId,
      status: dispatch.status,
      statusLabel: this.statusLabel(dispatch),
      category: dispatch.category,
      modality: dispatch.modality,
      city: dispatch.city,
      neighborhood: dispatch.neighborhood,
      radiusKm: dispatch.radiusKm,
      currentWave: dispatch.currentWave,
      responseWindowSeconds: dispatch.responseWindowSeconds,
      expiresAt: dispatch.expiresAt.toISOString(),
      secondsRemaining: this.secondsRemaining(dispatch.expiresAt),
      clientMessages: this.clientMessages(dispatch),
      professionalMessages: [
        'Novo pedido',
        'Pedir explicação',
        'Enviar proposta',
        'Recusar',
      ],
      waves: dispatch.waves.map((wave) => ({
        id: wave.id,
        number: wave.number,
        label: wave.label,
        radiusKm: wave.radiusKm,
        status: wave.status,
        sentAt: wave.sentAt?.toISOString(),
        expiresAt: wave.expiresAt?.toISOString(),
        totalProfessionals: wave.professionals.length,
        professionals: wave.professionals.map((candidate) =>
          this.toPublicProfessional(candidate),
        ),
      })),
      currentProfessionals:
        currentWave?.professionals.map((candidate) =>
          this.toPublicProfessional(candidate),
        ) ?? [],
      proposals: dispatch.proposals.map((proposal) => ({
        ...proposal,
        createdAt: proposal.createdAt.toISOString(),
        expiresAt: proposal.expiresAt.toISOString(),
        secondsRemaining: this.secondsRemaining(proposal.expiresAt),
      })),
      timeline: dispatch.timeline.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      createdAt: dispatch.createdAt.toISOString(),
      updatedAt: dispatch.updatedAt.toISOString(),
    };
  }

  private toPublicProfessional(candidate: ScoredProfessional) {
    const profile = candidate.profile;
    const etaMinutes = Math.round(
      this.clamp(profile.responseMinutes * 1.4, 8, 25),
    );
    const specialty = this.displaySpecialty(
      profile.specialties[0] ?? profile.modalities[0] ?? profile.category,
    );

    return {
      id: profile.id,
      name: this.cleanText(profile.name),
      category: profile.category,
      specialty,
      rating: profile.rating,
      distanceKm: profile.distanceKm,
      neighborhood: this.cleanText(profile.neighborhood),
      city: this.cleanText(profile.city),
      etaMinutes,
      etaLabel: `Chega em ~${etaMinutes} minutos`,
      availabilityLabel: this.availabilityLabel(profile),
      specialtyLabel: `Especialista em ${specialty}`,
      compatibilityLabel:
        candidate.score.finalScore >= 84
          ? 'Alta compatibilidade'
          : 'Compatibilidade validada',
      recommendedLabel:
        candidate.score.specialty >= 84 && candidate.score.reputation >= 78
          ? 'Especialista recomendado'
          : undefined,
      visibleBadges: candidate.visibleBadges,
      headline: candidate.headline,
      scoreBreakdown: candidate.score,
      scoreFactors: {
        reputation: candidate.score.reputation,
        distance: candidate.score.distance,
        responseTime: candidate.score.response,
        availability: candidate.score.availability,
        urgency: candidate.score.urgency,
        specialty: candidate.score.specialty,
      },
    };
  }

  private visibleBadges(score: ScoreBreakdown, profile: ProfessionalProfile) {
    const badges = [
      score.specialty >= 84 && score.reputation >= 78
        ? 'Especialista recomendado'
        : undefined,
      score.finalScore >= 84 ? 'Alta compatibilidade' : undefined,
      score.response >= 82 ? 'Resposta rápida' : undefined,
      score.specialty >= 84 ? 'Boa opção para o serviço' : undefined,
      score.availability >= 75 ? 'Disponível para atendimento' : undefined,
      score.risk >= 82 || profile.riskScore >= 88
        ? 'Profissional verificado'
        : undefined,
    ].filter(Boolean) as string[];

    return badges
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, 4);
  }

  private headline(score: ScoreBreakdown) {
    if (score.specialty >= 88 && score.reputation >= 82) {
      return 'Especialista recomendado';
    }

    if (score.finalScore >= 84) {
      return 'Alta compatibilidade';
    }

    if (score.response >= 84) {
      return 'Esse profissional respondeu rapidamente.';
    }

    if (score.availability >= 78) {
      return 'Disponível para atendimento.';
    }

    return 'Boa opção para o serviço.';
  }

  private conversionMessage(candidate?: ScoredProfessional) {
    if (!candidate) {
      return 'Resposta recebida. Compare prazo, escopo e observacoes.';
    }

    if (candidate.score.response >= 84) {
      return 'Esse profissional respondeu rapidamente.';
    }

    return 'Compare prazo, material, escopo e observacoes antes de aceitar.';
  }

  private statusLabel(dispatch: DispatchMock) {
    if (dispatch.status === 'PROPOSAL_RECEIVED') {
      return 'Nova proposta recebida';
    }
    if (dispatch.status === 'ACCEPTED') {
      return 'Encontramos uma boa opção';
    }
    if (dispatch.status === 'CANCELLED') {
      return 'Busca cancelada';
    }
    if (dispatch.status === 'EXPIRED') {
      return 'Profissional não respondeu';
    }
    return 'Aguardando respostas';
  }

  private clientMessages(dispatch: DispatchMock) {
    return [
      'Buscando profissionais disponiveis',
      'Enviando solicitacao',
      dispatch.status === 'PROPOSAL_RECEIVED'
        ? 'Nova proposta recebida'
        : 'Aguardando respostas',
      dispatch.currentWave >= 3
        ? 'Busca ampliada'
        : 'Voce pode aceitar agora ou aguardar novas respostas.',
      'Pagamento protegido libera o contato com seguranca.',
    ];
  }

  private expireStaleDispatches() {
    const now = new Date();

    for (const dispatch of this.dispatches) {
      if (
        dispatch.status !== 'WAITING_RESPONSES' ||
        dispatch.expiresAt.getTime() > now.getTime()
      ) {
        continue;
      }

      const currentWave = dispatch.waves.find(
        (wave) => wave.number === dispatch.currentWave,
      );
      if (currentWave) {
        currentWave.status = 'EXPIRED';
      }

      const hasNext = dispatch.waves.some(
        (wave) => wave.number === dispatch.currentWave + 1,
      );
      dispatch.status = hasNext ? 'SEARCHING' : 'EXPIRED';
      dispatch.updatedAt = now;
      dispatch.timeline.push({
        status: hasNext ? 'EXPANSION_READY' : 'EXPIRED',
        message: hasNext
          ? 'Profissional não respondeu. Busca pronta para proxima onda.'
          : 'Nenhum profissional respondeu dentro do prazo',
        createdAt: now,
      });
    }
  }

  private emitDispatchEvent(dispatch: DispatchMock, eventName: string) {
    RealtimeGateway.emitOperational(eventName, {
      orderId: dispatch.orderId,
      dispatchId: dispatch.id,
      status: dispatch.status,
      currentWave: dispatch.currentWave,
      message: this.statusLabel(dispatch),
      timestamp: dispatch.updatedAt.toISOString(),
    });
  }

  private notifyProfessionals(dispatch: DispatchMock, wave?: DispatchWave) {
    if (!wave) {
      return;
    }

    void this.pushRealService
      .notifyOrderEvent('NEW_REQUEST', {
        orderId: dispatch.orderId,
        professionalIds: wave.professionals.map(
          (candidate) => candidate.profile.id,
        ),
        serviceTitle: dispatch.modality,
        status: dispatch.status,
      })
      .catch(() => undefined);
  }

  private isVisibleProductionUser(user: any) {
    return !containsOperationalResidue(
      [
        user?.id,
        user?.name,
        user?.email,
        ...(user?.acceptedOrders ?? []).flatMap((order: any) => [
          order?.title,
          order?.category,
          order?.address,
        ]),
      ].join(' '),
    );
  }

  private isInCooldown(professionalId: string) {
    const last = this.lastDispatchByProfessional.get(professionalId);

    return last ? Date.now() - last.getTime() < this.spamCooldownMs : false;
  }

  private availabilityLabel(profile?: ProfessionalProfile) {
    if (!profile) {
      return 'Disponível para atendimento';
    }

    if (!profile.available || !profile.online) {
      return 'Agenda em análise';
    }

    if (profile.responseMinutes <= 8) {
      return 'Disponível para atendimento';
    }

    return `Resposta em ${Math.round(
      this.clamp(profile.responseMinutes, 8, 25),
    )} min`;
  }

  private averageResponseMinutes(orders: any[]) {
    const samples = orders
      .map((order) => {
        if (!order.acceptedAt || !order.createdAt) {
          return undefined;
        }

        return Math.max(
          1,
          Math.round(
            (new Date(order.acceptedAt).getTime() -
              new Date(order.createdAt).getTime()) /
              60000,
          ),
        );
      })
      .filter((value) => Number.isFinite(value)) as number[];

    if (!samples.length) {
      return undefined;
    }

    return Math.round(
      samples.reduce((total, value) => total + value, 0) / samples.length,
    );
  }

  private averagePrice(orders: any[]) {
    const values = orders
      .map((order) => Number(order.price ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!values.length) {
      return undefined;
    }

    return this.roundCurrency(
      values.reduce((total, value) => total + value, 0) / values.length,
    );
  }

  private syntheticDistance(id: string, index: number) {
    const hash = id
      .split('')
      .reduce((total, char) => total + char.charCodeAt(0), index * 13);

    return this.roundCurrency(0.8 + (hash % 28) * 0.24);
  }

  private extractNeighborhood(address?: string | null) {
    const text = this.readString(address);

    if (!text) {
      return undefined;
    }

    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)[0];
  }

  private secondsRemaining(date: Date) {
    return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
  }

  private addSeconds(date: Date, seconds: number) {
    return new Date(date.getTime() + seconds * 1000);
  }

  private readString(value: any) {
    const text = repairLegacyEncoding(value)?.trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readObject(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private readNumber(value: any, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private normalizeText(value?: string) {
    return (value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private unique(values: Array<string | undefined>) {
    return Array.from(
      new Set(values.map((value) => this.readString(value)).filter(Boolean)),
    );
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private cleanText(value: any) {
    return this.readString(value) ?? '';
  }

  private displaySpecialty(value?: string) {
    const text = this.readString(value) ?? 'serviço residencial';

    return text
      .replace(/elétrica/g, 'elétrica')
      .replace(/hidraulica/g, 'hidráulica')
      .replace(/refrigeracao/g, 'refrigeração')
      .replace(/construcao/g, 'construção');
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }
}


