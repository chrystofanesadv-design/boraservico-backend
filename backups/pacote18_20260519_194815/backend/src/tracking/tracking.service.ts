import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

interface LocationPoint {
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  createdAt: Date;
}

interface TrackingSession {
  orderId: string;
  professionalId: string;
  status: 'WAITING' | 'CHECKED_IN' | 'IN_PROGRESS' | 'CHECKED_OUT';
  checkInAt?: Date;
  checkOutAt?: Date;
  lastLocation?: LocationPoint;
  history: LocationPoint[];
  proofPhotoUrl?: string;
  note?: string;
  eta?: string;
  routeProgress?: number;
  updatedAt: Date;
}

@Injectable()
export class TrackingService {
  private readonly sessions = new Map<string, TrackingSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
  ) {}

  async checkIn(data: any) {
    const session = this.ensureSession(data);
    const point = this.makePoint(data);

    session.status = 'CHECKED_IN';
    session.checkInAt = session.checkInAt ?? new Date();
    session.lastLocation = point;
    session.history.push(point);
    session.eta = 'No local';
    session.routeProgress = this.readNumber(data?.routeProgress, 0.7);
    session.updatedAt = new Date();

    const payload = this.toEventPayload(session, 'Check-in validado');

    RealtimeGateway.emitOperational('check-in', payload);
    RealtimeGateway.emitOperational('order-status-updated', {
      ...payload,
      status: 'CHECKED_IN',
    });
    this.pushEvent('CHECK_IN', payload);

    await this.tryPersistTrackingEvent(session, point);

    return this.toPublicSession(session);
  }

  async location(data: any) {
    const session = this.ensureSession(data);
    const point = this.makePoint(data);
    const wasWaiting = session.status === 'WAITING';

    session.status = 'IN_PROGRESS';
    session.lastLocation = point;
    session.history.push(point);
    session.eta = this.readString(data?.eta) || 'Atualizado agora';
    session.routeProgress = this.readNumber(
      data?.routeProgress,
      session.routeProgress ?? 0.48,
    );
    session.updatedAt = new Date();

    RealtimeGateway.emitOperational(
      'location-update',
      this.toEventPayload(session, 'Tracking atualizado'),
    );
    if (wasWaiting) {
      this.pushEvent(
        'PROFESSIONAL_ON_THE_WAY',
        this.toEventPayload(session, 'Profissional a caminho'),
      );
    }

    await this.tryPersistTrackingEvent(session, point);

    return this.toPublicSession(session);
  }

  async checkOut(data: any) {
    const session = this.ensureSession(data);
    const point = this.makePoint(data);

    session.status = 'CHECKED_OUT';
    session.checkOutAt = new Date();
    session.lastLocation = point;
    session.history.push(point);
    session.proofPhotoUrl = this.readString(data?.proofPhotoUrl ?? data?.url);
    session.note = this.readString(data?.note);
    session.eta = 'Concluido no local';
    session.routeProgress = this.readNumber(data?.routeProgress, 0.92);
    session.updatedAt = new Date();

    const payload = this.toEventPayload(
      session,
      session.note || 'Check-out confirmado',
    );

    RealtimeGateway.emitOperational('proof-uploaded', {
      ...payload,
      url: session.proofPhotoUrl,
    });
    RealtimeGateway.emitOperational('order-status-updated', {
      ...payload,
      status: 'CHECKED_OUT',
    });
    if (session.proofPhotoUrl) {
      this.pushEvent('PROOF_UPLOADED', payload);
    }

    await this.tryPersistTrackingEvent(session, point);

    return this.toPublicSession(session);
  }

  async findByOrder(orderId: string) {
    const persisted = await this.tryFindPersistedEvents(orderId);

    if (persisted?.length) {
      return this.toPublicSession(this.fromPersistedEvents(orderId, persisted));
    }

    return this.toPublicSession(this.ensureSession({ orderId }));
  }

  async findAll() {
    const persisted = await this.tryFindAllPersistedEvents();

    if (persisted?.length) {
      return Array.from(this.groupEventsByOrder(persisted).entries()).map(
        ([orderId, events]) =>
          this.toPublicSession(this.fromPersistedEvents(orderId, events)),
      );
    }

    return Array.from(this.sessions.values()).map((session) =>
      this.toPublicSession(session),
    );
  }

  private async tryPersistTrackingEvent(
    session: TrackingSession,
    point: LocationPoint,
  ) {
    try {
      await this.prisma.trackingEvent.create({
        data: {
          orderId: session.orderId,
          lat: point.lat,
          lng: point.lng,
          actorId: this.uuidOrUndefined(session.professionalId),
          status: session.status,
          timestamp: point.createdAt,
          metadata: {
            professionalId: session.professionalId,
            eta: session.eta,
            routeProgress: session.routeProgress,
            proofPhotoUrl: session.proofPhotoUrl,
            note: session.note,
          },
        },
      });
    } catch {
      return null;
    }
  }

  private async tryFindPersistedEvents(orderId: string) {
    const normalizedOrderId = this.readString(orderId);

    if (!normalizedOrderId) {
      return null;
    }

    try {
      return await this.prisma.trackingEvent.findMany({
        where: { orderId: normalizedOrderId },
        orderBy: { timestamp: 'asc' },
      });
    } catch {
      return null;
    }
  }

  private async tryFindAllPersistedEvents() {
    try {
      return await this.prisma.trackingEvent.findMany({
        orderBy: { timestamp: 'asc' },
        take: 300,
      });
    } catch {
      return null;
    }
  }

  private fromPersistedEvents(
    orderId: string,
    events: any[],
  ): TrackingSession {
    const normalizedOrderId = this.readString(orderId) || 'BS-0505-OP';
    const lastEvent = events[events.length - 1];
    const metadata = this.readMetadata(lastEvent?.metadata);
    const history = events.map((event) => ({
      latitude: event.lat,
      longitude: event.lng,
      lat: event.lat,
      lng: event.lng,
      createdAt: event.timestamp,
    }));

    return {
      orderId: normalizedOrderId,
      professionalId:
        this.readString(metadata.professionalId) ||
        this.readString(lastEvent?.actorId) ||
        'pro-operational',
      status: this.normalizeStatus(lastEvent?.status),
      checkInAt: events.find((event) => event.status === 'CHECKED_IN')
        ?.timestamp,
      checkOutAt: events.find((event) => event.status === 'CHECKED_OUT')
        ?.timestamp,
      lastLocation: history[history.length - 1],
      history,
      proofPhotoUrl: this.readString(metadata.proofPhotoUrl),
      note: this.readString(metadata.note),
      eta: this.readString(metadata.eta) || 'Atualizado agora',
      routeProgress: this.readNumber(metadata.routeProgress, 0.48),
      updatedAt: lastEvent?.timestamp ?? new Date(),
    };
  }

  private groupEventsByOrder(events: any[]) {
    return events.reduce((groups, event) => {
      const orderId = event.orderId;
      const orderEvents = groups.get(orderId) ?? [];
      orderEvents.push(event);
      groups.set(orderId, orderEvents);
      return groups;
    }, new Map<string, any[]>());
  }

  private ensureSession(data: any) {
    const orderId = this.readString(data?.orderId) || 'BS-0505-OP';
    const existing = this.sessions.get(orderId);

    if (existing) {
      const professionalId = this.readString(data?.professionalId);

      if (professionalId) {
        existing.professionalId = professionalId;
      }

      return existing;
    }

    const session: TrackingSession = {
      orderId,
      professionalId:
        this.readString(data?.professionalId) || 'pro-operational',
      status: 'WAITING',
      history: [],
      eta: 'Calculando ETA',
      routeProgress: 0.22,
      updatedAt: new Date(),
    };

    this.sessions.set(orderId, session);
    return session;
  }

  private makePoint(data: any): LocationPoint {
    const latitude = this.readNumber(data?.latitude ?? data?.lat, -7.0261);
    const longitude = this.readNumber(data?.longitude ?? data?.lng, -37.2757);

    return {
      latitude,
      longitude,
      lat: latitude,
      lng: longitude,
      createdAt: new Date(),
    };
  }

  private toEventPayload(session: TrackingSession, message: string) {
    const lastLocation = session.lastLocation ?? this.makePoint({});

    return {
      orderId: session.orderId,
      professionalId: session.professionalId,
      lat: lastLocation.lat,
      lng: lastLocation.lng,
      latitude: lastLocation.latitude,
      longitude: lastLocation.longitude,
      eta: session.eta,
      routeProgress: session.routeProgress,
      message,
      updatedAt: session.updatedAt.toISOString(),
      timestamp: session.updatedAt.toISOString(),
    };
  }

  private toPublicSession(session: TrackingSession) {
    return {
      success: true,
      orderId: session.orderId,
      professionalId: session.professionalId,
      status: session.status,
      eta: session.eta,
      routeProgress: session.routeProgress,
      lastLocation: session.lastLocation
        ? {
            latitude: session.lastLocation.latitude,
            longitude: session.lastLocation.longitude,
            lat: session.lastLocation.lat,
            lng: session.lastLocation.lng,
            createdAt: session.lastLocation.createdAt.toISOString(),
          }
        : null,
      history: session.history.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        lat: point.lat,
        lng: point.lng,
        createdAt: point.createdAt.toISOString(),
      })),
      proofPhotoUrl: session.proofPhotoUrl,
      note: session.note,
      checkInAt: session.checkInAt?.toISOString(),
      checkOutAt: session.checkOutAt?.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private pushEvent(
    eventType: 'CHECK_IN' | 'PROFESSIONAL_ON_THE_WAY' | 'PROOF_UPLOADED',
    payload: Record<string, any>,
  ) {
    void this.pushRealService
      .notifyOrderEvent(eventType, payload)
      .catch(() => undefined);
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readNumber(value: any, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private readMetadata(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private normalizeStatus(value: any): TrackingSession['status'] {
    const status = this.readString(value)?.toUpperCase();

    if (
      status === 'CHECKED_IN' ||
      status === 'IN_PROGRESS' ||
      status === 'CHECKED_OUT'
    ) {
      return status;
    }

    return 'WAITING';
  }

  private uuidOrUndefined(value: any) {
    const text = this.readString(value);

    return text &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        text,
      )
      ? text
      : undefined;
  }
}
