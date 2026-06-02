import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type TimelineEventType =
  | 'CREATED'
  | 'MATCHING_STARTED'
  | 'PROFESSIONAL_ACCEPTED'
  | 'PROFESSIONAL_ON_THE_WAY'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'CHECKED_OUT'
  | 'PROOF_UPLOADED'
  | 'COMPLETED'
  | 'PAYMENT_RELEASED'
  | 'CANCELLED'
  | 'DISPUTE_OPENED'
  | 'RATING_REQUESTED';

interface TimelineEvent {
  id: string;
  orderId: string;
  type: TimelineEventType;
  phase: string;
  title: string;
  subtitle: string;
  description: string;
  state: 'complete' | 'current' | 'upcoming' | 'alert';
  latitude?: number;
  longitude?: number;
  proofPhotoUrl?: string;
  createdAt: Date;
}

@Injectable()
export class TimelineService {
  private readonly events: TimelineEvent[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async findByOrder(orderId: string) {
    const normalizedOrderId = this.readString(orderId) || 'BS-0505-OP';
    const persisted = await this.tryFindPersistedEvents(normalizedOrderId);

    if (persisted?.length) {
      return persisted.map((event) => this.toPublicPrismaEvent(event));
    }

    const events = this.events
      .filter((event) => event.orderId === normalizedOrderId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (events.length === 0) {
      return this.defaultTimeline(normalizedOrderId);
    }

    return events.map((event) => this.toPublicEvent(event));
  }

  async createEvent(data: any) {
    const orderId = this.readString(data?.orderId) || 'BS-0505-OP';
    const type = this.normalizeType(data?.type);
    const phase = this.phaseForType(type);
    const persisted = await this.tryPersistTimelineEvent(data, orderId, type);

    if (persisted) {
      const publicEvent = this.toPublicPrismaEvent(persisted);
      const events = await this.findByOrder(orderId);

      RealtimeGateway.emitOperational('timeline-update', {
        orderId,
        event: publicEvent,
        events,
        message: publicEvent.title,
        timestamp: publicEvent.createdAt,
      });

      return publicEvent;
    }

    const event: TimelineEvent = {
      id: randomUUID(),
      orderId,
      type,
      phase,
      title: this.readString(data?.title) || this.titleForType(type),
      subtitle:
        this.readString(data?.subtitle) || this.subtitleForType(type),
      description:
        this.readString(data?.description) || this.subtitleForType(type),
      state: this.readState(data?.state) || 'current',
      latitude: this.readOptionalNumber(data?.latitude ?? data?.lat),
      longitude: this.readOptionalNumber(data?.longitude ?? data?.lng),
      proofPhotoUrl: this.readString(data?.proofPhotoUrl ?? data?.url),
      createdAt: new Date(),
    };

    this.events.push(event);

    const publicEvent = this.toPublicEvent(event);

    RealtimeGateway.emitOperational('timeline-update', {
      orderId,
      event: publicEvent,
      events: await this.findByOrder(orderId),
      message: publicEvent.title,
      timestamp: publicEvent.createdAt,
    });

    return publicEvent;
  }

  checkIn(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'CHECKED_IN',
      title: 'Check-in',
      description: data?.description ?? 'Chegada validada no atendimento.',
      latitude: data?.latitude ?? data?.lat,
      longitude: data?.longitude ?? data?.lng,
    });
  }

  checkOut(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'CHECKED_OUT',
      title: 'Check-out',
      description:
        data?.description ?? 'Servico finalizado no local com evidencia.',
      latitude: data?.latitude ?? data?.lat,
      longitude: data?.longitude ?? data?.lng,
      proofPhotoUrl: data?.proofPhotoUrl ?? data?.url,
    });
  }

  complete(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'COMPLETED',
      title: 'Ordem concluida',
      description: data?.description ?? 'Execucao encerrada.',
    });
  }

  async seedDemo(orderId: string) {
    const created = await this.createEvent({
      orderId,
      type: 'CREATED',
      title: 'Solicitacao enviada',
      description: 'Pedido registrado no fluxo operacional.',
      state: 'complete',
    });

    const matching = await this.createEvent({
      orderId,
      type: 'MATCHING_STARTED',
      title: 'IA analisando',
      description: 'Categoria, risco, preco e prioridade em validacao.',
      state: 'complete',
    });

    const accepted = await this.createEvent({
      orderId,
      type: 'PROFESSIONAL_ACCEPTED',
      title: 'Profissional encontrado',
      description: 'Match confirmado com disponibilidade.',
      state: 'current',
    });

    return {
      success: true,
      orderId,
      events: [created, matching, accepted],
    };
  }

  async findAll() {
    const persisted = await this.tryFindAllPersistedEvents();

    if (persisted?.length) {
      return persisted.map((event) => this.toPublicPrismaEvent(event));
    }

    if (this.events.length === 0) {
      return this.defaultTimeline('BS-0505-OP');
    }

    return this.events
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((event) => this.toPublicEvent(event));
  }

  private async tryPersistTimelineEvent(
    data: any,
    orderId: string,
    type: TimelineEventType,
  ) {
    try {
      return await this.prisma.operationalTimelineEvent.create({
        data: {
          orderId,
          type,
          title: this.readString(data?.title) || this.titleForType(type),
          description:
            this.readString(data?.description) || this.subtitleForType(type),
          state: this.toPrismaState(
            this.readState(data?.state) || 'current',
          ) as any,
          timestamp: new Date(),
          metadata: {
            phase: this.phaseForType(type),
            subtitle:
              this.readString(data?.subtitle) || this.subtitleForType(type),
            latitude: this.readOptionalNumber(data?.latitude ?? data?.lat),
            longitude: this.readOptionalNumber(data?.longitude ?? data?.lng),
            proofPhotoUrl: this.readString(data?.proofPhotoUrl ?? data?.url),
          },
        },
      });
    } catch {
      return null;
    }
  }

  private async tryFindPersistedEvents(orderId: string) {
    try {
      return await this.prisma.operationalTimelineEvent.findMany({
        where: { orderId },
        orderBy: { timestamp: 'asc' },
      });
    } catch {
      return null;
    }
  }

  private async tryFindAllPersistedEvents() {
    try {
      return await this.prisma.operationalTimelineEvent.findMany({
        orderBy: { timestamp: 'asc' },
        take: 300,
      });
    } catch {
      return null;
    }
  }

  private defaultTimeline(orderId: string) {
    const now = new Date().toISOString();

    return [
      this.defaultEntry(orderId, 'request', 'Solicitacao enviada', 'complete', now),
      this.defaultEntry(orderId, 'ai', 'IA analisando', 'complete', now),
      this.defaultEntry(
        orderId,
        'match',
        'Profissional encontrado',
        'current',
        now,
      ),
      this.defaultEntry(orderId, 'route', 'Deslocamento', 'upcoming'),
      this.defaultEntry(orderId, 'checkIn', 'Check-in', 'upcoming'),
      this.defaultEntry(orderId, 'execution', 'Execucao', 'upcoming'),
      this.defaultEntry(orderId, 'proof', 'Prova', 'upcoming'),
      this.defaultEntry(orderId, 'completion', 'Conclusao', 'upcoming'),
      this.defaultEntry(orderId, 'payment', 'Pagamento', 'upcoming'),
      this.defaultEntry(orderId, 'rating', 'Avaliacao', 'upcoming'),
    ];
  }

  private defaultEntry(
    orderId: string,
    phase: string,
    title: string,
    state: 'complete' | 'current' | 'upcoming' | 'alert',
    timestamp?: string,
  ) {
    return {
      success: true,
      id: `${orderId}-${phase}`,
      orderId,
      phase,
      title,
      subtitle: this.subtitleForPhase(phase),
      description: this.subtitleForPhase(phase),
      state,
      createdAt: timestamp,
      timestamp,
    };
  }

  private toPublicEvent(event: TimelineEvent) {
    return {
      success: true,
      id: event.id,
      orderId: event.orderId,
      type: event.type,
      phase: event.phase,
      title: event.title,
      subtitle: event.subtitle,
      description: event.description,
      state: event.state,
      latitude: event.latitude,
      longitude: event.longitude,
      proofPhotoUrl: event.proofPhotoUrl,
      createdAt: event.createdAt.toISOString(),
      timestamp: event.createdAt.toISOString(),
    };
  }

  private toPublicPrismaEvent(event: any) {
    const metadata = this.readMetadata(event.metadata);
    const phase = this.readString(metadata.phase) || this.phaseForType(event.type);
    const subtitle =
      this.readString(metadata.subtitle) || this.subtitleForPhase(phase);
    const timestamp = event.timestamp?.toISOString?.() ?? event.timestamp;

    return {
      success: true,
      id: event.id,
      orderId: event.orderId,
      type: event.type,
      phase,
      title: event.title,
      subtitle,
      description: event.description || subtitle,
      state: this.fromPrismaState(event.state),
      latitude: this.readOptionalNumber(metadata.latitude),
      longitude: this.readOptionalNumber(metadata.longitude),
      proofPhotoUrl: this.readString(metadata.proofPhotoUrl),
      createdAt: timestamp,
      timestamp,
    };
  }

  private normalizeType(value: any): TimelineEventType {
    const normalized = this.readString(value)?.toUpperCase();
    const allowed: TimelineEventType[] = [
      'CREATED',
      'MATCHING_STARTED',
      'PROFESSIONAL_ACCEPTED',
      'PROFESSIONAL_ON_THE_WAY',
      'CHECKED_IN',
      'IN_PROGRESS',
      'CHECKED_OUT',
      'PROOF_UPLOADED',
      'COMPLETED',
      'PAYMENT_RELEASED',
      'CANCELLED',
      'DISPUTE_OPENED',
      'RATING_REQUESTED',
    ];

    if (normalized && allowed.includes(normalized as TimelineEventType)) {
      return normalized as TimelineEventType;
    }

    return 'CREATED';
  }

  private phaseForType(type: TimelineEventType) {
    const phases: Record<TimelineEventType, string> = {
      CREATED: 'request',
      MATCHING_STARTED: 'ai',
      PROFESSIONAL_ACCEPTED: 'match',
      PROFESSIONAL_ON_THE_WAY: 'route',
      CHECKED_IN: 'checkIn',
      IN_PROGRESS: 'execution',
      CHECKED_OUT: 'proof',
      PROOF_UPLOADED: 'proof',
      COMPLETED: 'completion',
      PAYMENT_RELEASED: 'payment',
      CANCELLED: 'completion',
      DISPUTE_OPENED: 'payment',
      RATING_REQUESTED: 'rating',
    };

    return phases[type];
  }

  private titleForType(type: TimelineEventType) {
    const titles: Record<TimelineEventType, string> = {
      CREATED: 'Solicitacao enviada',
      MATCHING_STARTED: 'IA analisando',
      PROFESSIONAL_ACCEPTED: 'Profissional encontrado',
      PROFESSIONAL_ON_THE_WAY: 'Deslocamento',
      CHECKED_IN: 'Check-in',
      IN_PROGRESS: 'Execucao',
      CHECKED_OUT: 'Check-out',
      PROOF_UPLOADED: 'Prova enviada',
      COMPLETED: 'Ordem concluida',
      PAYMENT_RELEASED: 'Pagamento liberado',
      CANCELLED: 'Ordem cancelada',
      DISPUTE_OPENED: 'Disputa aberta',
      RATING_REQUESTED: 'Avaliacao',
    };

    return titles[type];
  }

  private subtitleForType(type: TimelineEventType) {
    return this.subtitleForPhase(this.phaseForType(type));
  }

  private subtitleForPhase(phase: string) {
    const subtitles: Record<string, string> = {
      request: 'Pedido registrado e pagamento protegido preparado.',
      ai: 'Categoria, risco, preco e prioridade em validacao.',
      match: 'Match confirmado com credenciais e disponibilidade.',
      route: 'Tracking vivo, ETA e rota sincronizados.',
      checkIn: 'Chegada validada no atendimento.',
      execution: 'Servico em andamento com suporte operacional.',
      proof: 'Foto, evidencia ou validacao anexada.',
      completion: 'Ordem encerrada e pronta para liquidacao.',
      payment: 'Escrow liberado com protecao.',
      rating: 'Experiencia pronta para nota e feedback.',
    };

    return subtitles[phase] ?? 'Evento operacional registrado.';
  }

  private readState(value: any) {
    const state = this.readString(value);

    if (
      state === 'complete' ||
      state === 'current' ||
      state === 'upcoming' ||
      state === 'alert'
    ) {
      return state;
    }

    return undefined;
  }

  private readOptionalNumber(value: any) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readMetadata(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private toPrismaState(state: TimelineEvent['state']) {
    const states: Record<TimelineEvent['state'], string> = {
      complete: 'COMPLETE',
      current: 'CURRENT',
      upcoming: 'UPCOMING',
      alert: 'ALERT',
    };

    return states[state];
  }

  private fromPrismaState(value: any): TimelineEvent['state'] {
    const state = this.readString(value)?.toUpperCase();
    const states: Record<string, TimelineEvent['state']> = {
      COMPLETE: 'complete',
      CURRENT: 'current',
      UPCOMING: 'upcoming',
      ALERT: 'alert',
    };

    return states[state ?? ''] ?? 'current';
  }
}
