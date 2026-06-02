import { Injectable } from '@nestjs/common';

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

  checkIn(data: any) {
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

    return this.toPublicSession(session);
  }

  location(data: any) {
    const session = this.ensureSession(data);
    const point = this.makePoint(data);

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

    return this.toPublicSession(session);
  }

  checkOut(data: any) {
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

    return this.toPublicSession(session);
  }

  findByOrder(orderId: string) {
    return this.toPublicSession(this.ensureSession({ orderId }));
  }

  findAll() {
    return Array.from(this.sessions.values()).map((session) =>
      this.toPublicSession(session),
    );
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

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readNumber(value: any, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
}
