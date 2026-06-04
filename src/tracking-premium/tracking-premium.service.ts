import { Injectable, Logger } from '@nestjs/common';
import {
  TrackingMissionStatus,
  TrackingPremiumActionDto,
  TrackingPremiumLocationDto,
  TrackingPremiumMissionDto,
} from './tracking-premium.dto';

export interface TrackingPremiumPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  heading?: number;
  speedMetersPerSecond?: number;
  timestamp: string;
}

export interface TrackingPremiumMission {
  orderId: string;
  clientId?: string;
  professionalId?: string;
  status: TrackingMissionStatus;
  destinationLatitude?: number;
  destinationLongitude?: number;
  destinationLabel?: string;
  estimatedDistanceMeters?: number;
  estimatedEtaMinutes?: number;
  geofenceRadiusMeters: number;
  arrivedInsideGeofence: boolean;
  lastProfessionalLocation?: TrackingPremiumPoint;
  checkIn?: TrackingPremiumPoint & { confirmedBySwipe: boolean; photoUrl?: string; note?: string };
  checkOut?: TrackingPremiumPoint & { confirmedBySwipe: boolean; photoUrl?: string; note?: string };
  timeline: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
}

@Injectable()
export class TrackingPremiumService {
  private readonly logger = new Logger(TrackingPremiumService.name);
  private readonly missions = new Map<string, TrackingPremiumMission>();
  private readonly defaultGeofenceRadiusMeters = 120;

  health(): Record<string, unknown> {
    return {
      status: 'ok',
      module: 'tracking-premium',
      activeMissions: this.missions.size,
      productionReady: false,
      note: 'Base premium pronta para integrar GPS real, WebSocket, push e mapas em producao.',
    };
  }

  upsertMission(dto: TrackingPremiumMissionDto): TrackingPremiumMission {
    const now = new Date().toISOString();
    const existing = this.missions.get(dto.orderId);

    const mission: TrackingPremiumMission = {
      orderId: dto.orderId,
      clientId: dto.clientId ?? existing?.clientId,
      professionalId: dto.professionalId ?? existing?.professionalId,
      status: dto.status ?? existing?.status ?? 'PAYMENT_PROTECTED',
      destinationLatitude: dto.destinationLatitude ?? existing?.destinationLatitude,
      destinationLongitude: dto.destinationLongitude ?? existing?.destinationLongitude,
      destinationLabel: dto.destinationLabel ?? existing?.destinationLabel,
      estimatedDistanceMeters: dto.estimatedDistanceMeters ?? existing?.estimatedDistanceMeters,
      estimatedEtaMinutes: dto.estimatedEtaMinutes ?? existing?.estimatedEtaMinutes,
      geofenceRadiusMeters: existing?.geofenceRadiusMeters ?? this.defaultGeofenceRadiusMeters,
      arrivedInsideGeofence: existing?.arrivedInsideGeofence ?? false,
      lastProfessionalLocation: existing?.lastProfessionalLocation,
      checkIn: existing?.checkIn,
      checkOut: existing?.checkOut,
      timeline: existing?.timeline ?? [],
      metadata: { ...(existing?.metadata ?? {}), ...(dto.metadata ?? {}) },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    mission.timeline.unshift({ type: 'MISSION_UPSERTED', status: mission.status, at: now });
    this.missions.set(dto.orderId, mission);
    return mission;
  }

  updateLocation(dto: TrackingPremiumLocationDto): TrackingPremiumMission {
    const mission = this.ensureMission(dto.orderId);
    const now = dto.timestamp ?? new Date().toISOString();

    const point: TrackingPremiumPoint = {
      latitude: Number(dto.latitude),
      longitude: Number(dto.longitude),
      accuracyMeters: dto.accuracyMeters,
      heading: dto.heading,
      speedMetersPerSecond: dto.speedMetersPerSecond,
      timestamp: now,
    };

    mission.lastProfessionalLocation = point;

    if (mission.destinationLatitude !== undefined && mission.destinationLongitude !== undefined) {
      const distance = this.distanceMeters(point.latitude, point.longitude, mission.destinationLatitude, mission.destinationLongitude);
      mission.estimatedDistanceMeters = Math.round(distance);
      mission.estimatedEtaMinutes = Math.max(1, Math.round(distance / 350));
      mission.arrivedInsideGeofence = distance <= mission.geofenceRadiusMeters;

      if (mission.arrivedInsideGeofence && mission.status === 'PROFESSIONAL_ON_THE_WAY') {
        mission.status = 'ARRIVED';
        mission.timeline.unshift({ type: 'GEOFENCE_ARRIVAL_DETECTED', distanceMeters: Math.round(distance), at: now });
      }
    }

    mission.updatedAt = now;
    mission.timeline.unshift({ type: 'LOCATION_UPDATED', role: dto.role ?? 'professional', at: now });
    this.missions.set(dto.orderId, mission);
    return mission;
  }

  markOnTheWay(orderId: string): TrackingPremiumMission {
    const mission = this.ensureMission(orderId);
    mission.status = 'PROFESSIONAL_ON_THE_WAY';
    mission.updatedAt = new Date().toISOString();
    mission.timeline.unshift({ type: 'PROFESSIONAL_ON_THE_WAY', at: mission.updatedAt, push: 'PROFESSIONAL_ON_THE_WAY' });
    return mission;
  }

  checkIn(dto: TrackingPremiumActionDto): TrackingPremiumMission {
    const mission = this.ensureMission(dto.orderId);
    const point = this.actionPoint(dto);
    mission.checkIn = { ...point, confirmedBySwipe: dto.confirmedBySwipe === true, photoUrl: dto.photoUrl, note: dto.note };
    mission.status = 'CHECKED_IN';
    mission.updatedAt = point.timestamp;
    mission.timeline.unshift({ type: 'CHECK_IN', at: point.timestamp, push: 'CHECK_IN', confirmedBySwipe: dto.confirmedBySwipe === true });
    this.missions.set(dto.orderId, mission);
    return mission;
  }

  checkOut(dto: TrackingPremiumActionDto): TrackingPremiumMission {
    const mission = this.ensureMission(dto.orderId);
    const point = this.actionPoint(dto);
    mission.checkOut = { ...point, confirmedBySwipe: dto.confirmedBySwipe === true, photoUrl: dto.photoUrl, note: dto.note };
    mission.status = 'CHECKED_OUT';
    mission.updatedAt = point.timestamp;
    mission.timeline.unshift({ type: 'CHECK_OUT', at: point.timestamp, push: 'CHECK_OUT', confirmedBySwipe: dto.confirmedBySwipe === true });
    this.missions.set(dto.orderId, mission);
    return mission;
  }

  list(): TrackingPremiumMission[] {
    return Array.from(this.missions.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(orderId: string): TrackingPremiumMission {
    return this.ensureMission(orderId);
  }

  private ensureMission(orderId: string): TrackingPremiumMission {
    const existing = this.missions.get(orderId);
    if (existing) {
      return existing;
    }
    return this.upsertMission({ orderId, status: 'PAYMENT_PROTECTED' });
  }

  private actionPoint(dto: TrackingPremiumActionDto): TrackingPremiumPoint {
    return {
      latitude: Number(dto.latitude ?? 0),
      longitude: Number(dto.longitude ?? 0),
      accuracyMeters: dto.accuracyMeters,
      timestamp: new Date().toISOString(),
    };
  }

  private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadiusMeters = 6371000;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMeters * c;
  }
}
