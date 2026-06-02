import { Injectable } from '@nestjs/common';

interface LocationPoint {
  latitude: number;
  longitude: number;
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
  updatedAt: Date;
}

@Injectable()
export class TrackingService {
  private sessions: TrackingSession[] = [];

  checkIn(data: any) {
    const orderId = data?.orderId;
    const professionalId = data?.professionalId;

    let session = this.sessions.find((item) => item.orderId === orderId);

    if (!session) {
      session = {
        orderId,
        professionalId,
        status: 'CHECKED_IN',
        checkInAt: new Date(),
        history: [],
        updatedAt: new Date(),
      };

      this.sessions.push(session);
    }

    const point = this.makePoint(data);

    session.status = 'CHECKED_IN';
    session.checkInAt = session.checkInAt ?? new Date();
    session.lastLocation = point;
    session.history.push(point);
    session.updatedAt = new Date();

    return session;
  }

  location(data: any) {
    const orderId = data?.orderId;

    const session = this.sessions.find((item) => item.orderId === orderId);

    if (!session) {
      return {
        error: 'TRACKING_NOT_FOUND',
        message: 'Sessao de tracking nao encontrada',
      };
    }

    const point = this.makePoint(data);

    session.status = 'IN_PROGRESS';
    session.lastLocation = point;
    session.history.push(point);
    session.updatedAt = new Date();

    return session;
  }

  checkOut(data: any) {
    const orderId = data?.orderId;

    const session = this.sessions.find((item) => item.orderId === orderId);

    if (!session) {
      return {
        error: 'TRACKING_NOT_FOUND',
        message: 'Sessao de tracking nao encontrada',
      };
    }

    const point = this.makePoint(data);

    session.status = 'CHECKED_OUT';
    session.checkOutAt = new Date();
    session.lastLocation = point;
    session.history.push(point);
    session.proofPhotoUrl = data?.proofPhotoUrl;
    session.note = data?.note;
    session.updatedAt = new Date();

    return session;
  }

  findByOrder(orderId: string) {
    return this.sessions.find((item) => item.orderId === orderId) ?? null;
  }

  findAll() {
    return this.sessions;
  }

  private makePoint(data: any): LocationPoint {
    return {
      latitude: Number(data?.latitude ?? 0),
      longitude: Number(data?.longitude ?? 0),
      createdAt: new Date(),
    };
  }
}
