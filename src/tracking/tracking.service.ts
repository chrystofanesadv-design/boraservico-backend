import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PushRealService } from '../push-real/push-real.service';
import { PrismaService } from '../prisma/prisma.service';

interface LocationUpdate {
  orderId: string;
  professionalId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  destinationLat?: number;
  destinationLng?: number;
  timestamp?: Date;
}

interface RouteData {
  eta?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  arrivalAt?: string;
  routePolyline?: string;
  routeProgress?: number;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly nearbyNotifications = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
  ) {}

  async findAll() {
    const events = await this.prisma.trackingEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    return events.map((event) => this.toPublicEvent(event));
  }

  async findByOrder(orderId: string) {
    const normalizedOrderId = this.readString(orderId);

    if (!normalizedOrderId) {
      return {
        success: false,
        error: 'MISSING_ORDER_ID',
        message: 'orderId obrigatorio',
      };
    }

    const events = await this.prisma.trackingEvent.findMany({
      where: { orderId: normalizedOrderId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    return {
      success: true,
      orderId: normalizedOrderId,
      events: events.map((event) => this.toPublicEvent(event)),
    };
  }

  async updateLocation(data: LocationUpdate) {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: data.orderId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const route = this.calculateRouteSnapshot(data);
    const persisted = await this.tryPersistTrackingEvent(data, route);

    if (persisted) {
      this.emitLocationUpdate(data.orderId, {
        orderId: data.orderId,
        professionalId: data.professionalId,
        lat: persisted.lat,
        lng: persisted.lng,
        accuracy: data.accuracy,
        speed: data.speed,
        heading: data.heading,
        eta: route.eta,
        distanceMeters: route.distanceMeters,
        timestamp: persisted.timestamp,
      });

      await this.notifyNearbyIfNeeded(data);

      return this.toPublicEvent(persisted);
    }

    return {
      success: true,
      orderId: data.orderId,
      lat: data.lat,
      lng: data.lng,
      speed: data.speed,
      heading: data.heading,
      eta: route.eta,
      distanceMeters: route.distanceMeters,
      timestamp: data.timestamp || new Date().toISOString(),
    };
  }

  async startDisplacement(data: any) {
    const input = this.requireTrackingInput(data);
    const route = this.calculateRouteSnapshot(input);

    const event = await this.createTrackingEvent({
      orderId: input.orderId,
      professionalId: input.professionalId,
      status: 'PROFESSIONAL_ON_THE_WAY',
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      speed: input.speed,
      heading: input.heading,
      metadata: {
        ...route,
        routeProgress: this.readOptionalNumber(data?.routeProgress) ?? 0.28,
        eta: route.eta ?? this.readString(data?.eta) ?? 'Atualizado agora',
        realtime: true,
        gpsRequired: true,
      },
    });

    void this.pushRealService
      .notifyOrderEvent('DISPLACEMENT_STARTED', {
        orderId: input.orderId,
        professionalId: input.professionalId,
      })
      .catch(() => undefined);

    return {
      ...event,
      route,
      tracking: {
        realtime: true,
        gpsRequired: true,
        etaRealtime: true,
        timelineRealtime: true,
        cinematic: true,
        controls: ['slide_start_route', 'slide_check_in', 'slide_check_out'],
      },
    };
  }

  async checkIn(data: any) {
    const input = this.requireTrackingInput(data);
    const route = this.calculateRouteSnapshot(input);
    const geofence = this.validateGeofence(data, route.distanceMeters);

    if (!geofence.allowed) {
      return geofence;
    }

    const event = await this.createTrackingEvent({
      orderId: input.orderId,
      professionalId: input.professionalId,
      status: 'CHECKED_IN',
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      speed: input.speed,
      heading: input.heading,
      metadata: {
        ...route,
        geofenceValidated: geofence.geofenceValidated,
        geofenceRadiusMeters: geofence.geofenceRadiusMeters,
      },
    });

    this.emitTracking(input.orderId, {
      orderId: input.orderId,
      professionalId: input.professionalId,
      status: 'PROFESSIONAL_ARRIVED',
      message: 'Seu profissional chegou.',
    });
    void this.pushRealService
      .notifyOrderEvent('PROFESSIONAL_ARRIVED', {
        orderId: input.orderId,
        professionalId: input.professionalId,
      })
      .catch(() => undefined);

    return event;
  }

  async checkOut(data: any) {
    const input = this.requireTrackingInput(data);
    const proofId = this.readString(data?.proofId);
    const proofUrl = this.readString(data?.proofUrl ?? data?.fileUrl);

    if (!proofId && !proofUrl) {
      return {
        success: false,
        allowed: false,
        error: 'PROOF_REQUIRED',
        message: 'Envie uma foto ou prova para finalizar o servico.',
      };
    }

    const event = await this.createTrackingEvent({
      orderId: input.orderId,
      professionalId: input.professionalId,
      status: 'CHECKED_OUT',
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      speed: input.speed,
      heading: input.heading,
      metadata: {
        proofId,
        proofUrl,
      },
    });

    void this.pushRealService
      .notifyOrderEvent('CHECK_OUT', {
        orderId: input.orderId,
        professionalId: input.professionalId,
      })
      .catch(() => undefined);

    return event;
  }

  async route(data: any) {
    const orderId = this.readString(data?.orderId);
    const origin = data?.origin ?? {
      lat: data?.lat ?? data?.latitude,
      lng: data?.lng ?? data?.longitude,
    };
    const destination = data?.destination ?? {
      lat: data?.destinationLat,
      lng: data?.destinationLng,
    };

    if (
      !orderId ||
      this.readOptionalNumber(origin?.lat) === undefined ||
      this.readOptionalNumber(origin?.lng) === undefined ||
      this.readOptionalNumber(destination?.lat) === undefined ||
      this.readOptionalNumber(destination?.lng) === undefined
    ) {
      return {
        success: false,
        error: 'INVALID_INPUT',
        message: 'orderId, origin e destination obrigatorios',
      };
    }

    const originLat = Number(origin.lat);
    const originLng = Number(origin.lng);
    const destinationLat = Number(destination.lat);
    const destinationLng = Number(destination.lng);
    const distanceMeters = this.calculateDistance(
      originLat,
      originLng,
      destinationLat,
      destinationLng,
    );

    const durationSeconds = Math.round(distanceMeters / 13.89);

    const routeData: RouteData = {
      eta: this.formatDuration(durationSeconds),
      distanceMeters,
      durationSeconds,
      arrivalAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
    };

    await this.prisma.trackingEvent
      .create({
        data: {
          orderId,
          lat: originLat,
          lng: originLng,
          actorId: null,
          status: 'IN_PROGRESS',
          metadata: JSON.stringify({
            distanceMeters,
            durationSeconds,
            eta: routeData.eta,
            calculatedAt: new Date().toISOString(),
          }),
        },
      })
      .catch(() => null);

    return {
      success: true,
      orderId,
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destinationLat, lng: destinationLng },
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        `${originLat},${originLng}`,
      )}&destination=${encodeURIComponent(`${destinationLat},${destinationLng}`)}`,
      distance: distanceMeters,
      distanceMeters,
      duration: durationSeconds,
      durationSeconds,
      eta: routeData.eta,
      routePolyline: routeData.routePolyline,
      route: {
        polyline: routeData.routePolyline,
        distanceText: this.formatDistance(distanceMeters),
        durationText: routeData.eta,
      },
    };
  }

  async location(data: any) {
    return this.updateLocation({
      orderId: data.orderId,
      professionalId: data.professionalId,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      speed: data.speed,
      heading: data.heading,
      destinationLat: this.readOptionalNumber(data.destinationLat),
      destinationLng: this.readOptionalNumber(data.destinationLng),
      timestamp: data.timestamp,
    });
  }

  private async notifyNearbyIfNeeded(data: LocationUpdate) {
    if (
      data.destinationLat === undefined ||
      data.destinationLng === undefined ||
      this.nearbyNotifications.has(data.orderId)
    ) {
      return;
    }

    const distanceMeters = this.calculateDistance(
      data.lat,
      data.lng,
      data.destinationLat,
      data.destinationLng,
    );

    if (distanceMeters > 300) {
      return;
    }

    this.nearbyNotifications.add(data.orderId);
    this.emitTracking(data.orderId, {
      orderId: data.orderId,
      professionalId: data.professionalId,
      status: 'PROFESSIONAL_NEARBY',
      lat: data.lat,
      lng: data.lng,
      distanceMeters,
      message: 'Profissional proximo ao local do servico',
    });
    await this.prisma.trackingEvent
      .create({
        data: {
          orderId: data.orderId,
          actorId: data.professionalId,
          lat: data.lat,
          lng: data.lng,
          status: 'PROFESSIONAL_NEARBY',
          metadata: JSON.stringify({
            distanceMeters,
            createdAt: new Date().toISOString(),
          }),
        },
      })
      .catch(() => null);
    void this.pushRealService
      .notifyOrderEvent('PROFESSIONAL_NEARBY', {
        orderId: data.orderId,
        professionalId: data.professionalId,
      })
      .catch(() => undefined);
  }

  private async createTrackingEvent(data: {
    orderId: string;
    professionalId: string;
    status: string;
    lat: number;
    lng: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    metadata?: Record<string, any>;
  }) {
    const persisted = await this.prisma.trackingEvent
      .create({
        data: {
          orderId: data.orderId,
          lat: data.lat,
          lng: data.lng,
          actorId: data.professionalId,
          status: data.status,
          metadata: JSON.stringify({
            accuracy: data.accuracy,
            speed: data.speed,
            heading: data.heading,
            createdAt: new Date().toISOString(),
            ...(data.metadata ?? {}),
          }),
        },
      })
      .catch(() => null);

    this.emitTracking(data.orderId, {
      orderId: data.orderId,
      professionalId: data.professionalId,
      status: data.status,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      speed: data.speed,
      heading: data.heading,
      ...(data.metadata ?? {}),
    });

    return this.toPublicEvent(
      persisted || {
        id: 'temp',
        orderId: data.orderId,
        lat: data.lat,
        lng: data.lng,
        actorId: data.professionalId,
        status: data.status,
        timestamp: new Date(),
        metadata: null,
      },
    );
  }

  private async tryPersistTrackingEvent(
    data: LocationUpdate,
    route: Record<string, any> = {},
  ) {
    try {
      return await this.prisma.trackingEvent.create({
        data: {
          orderId: data.orderId,
          lat: data.lat,
          lng: data.lng,
          actorId: data.professionalId,
          status: 'IN_PROGRESS',
          metadata: JSON.stringify({
            accuracy: data.accuracy,
            speed: data.speed,
            heading: data.heading,
            timestamp: (data.timestamp || new Date()).toISOString(),
            ...route,
          }),
        },
      });
    } catch {
      return null;
    }
  }

  private toPublicEvent(event: any) {
    let metadata: any = {};
    if (event.metadata) {
      if (typeof event.metadata === 'string') {
        try {
          metadata = JSON.parse(event.metadata);
        } catch {
          metadata = {};
        }
      } else {
        metadata = event.metadata || {};
      }
    }

    return {
      success: true,
      id: event.id,
      orderId: event.orderId,
      lat: event.lat,
      lng: event.lng,
      actorId: event.actorId,
      status: event.status,
      accuracy: metadata.accuracy,
      speed: metadata.speed,
      heading: metadata.heading,
      eta: metadata.eta,
      routeProgress: metadata.routeProgress,
      distanceMeters: metadata.distanceMeters,
      durationSeconds: metadata.durationSeconds,
      geofenceValidated: metadata.geofenceValidated,
      geofenceRadiusMeters: metadata.geofenceRadiusMeters,
      timestamp: event.timestamp?.toISOString?.() || event.timestamp,
      metadata,
    };
  }

  private emitLocationUpdate(orderId: string, data: any) {
    try {
      const { RealtimeGateway } = require('../realtime/realtime.gateway');
      RealtimeGateway.emitOperational('location-update', { orderId, ...data });
    } catch {
      // RealtimeGateway may not be available
    }
  }

  private emitTracking(orderId: string, data: any) {
    try {
      const { RealtimeGateway } = require('../realtime/realtime.gateway');
      RealtimeGateway.emitOperational('tracking-update', { orderId, ...data });
    } catch {
      // RealtimeGateway may not be available
    }
  }

  private requireTrackingInput(data: any) {
    const orderId = this.readString(data?.orderId);
    const professionalId = this.readString(data?.professionalId);
    const lat = this.readOptionalNumber(data?.lat ?? data?.latitude);
    const lng = this.readOptionalNumber(data?.lng ?? data?.longitude);

    if (!orderId) {
      throw new BadRequestException('orderId obrigatorio');
    }

    if (!professionalId) {
      throw new BadRequestException('professionalId obrigatorio');
    }

    if (lat === undefined || lng === undefined) {
      throw new BadRequestException('GPS obrigatorio para tracking');
    }

    return {
      orderId,
      professionalId,
      lat,
      lng,
      accuracy: this.readOptionalNumber(data?.accuracy),
      speed: this.readOptionalNumber(data?.speed),
      heading: this.readOptionalNumber(data?.heading),
      destinationLat: this.readOptionalNumber(
        data?.destinationLat ?? data?.destination?.lat,
      ),
      destinationLng: this.readOptionalNumber(
        data?.destinationLng ?? data?.destination?.lng,
      ),
    };
  }

  private calculateRouteSnapshot(input: {
    lat: number;
    lng: number;
    destinationLat?: number;
    destinationLng?: number;
  }) {
    if (
      input.destinationLat === undefined ||
      input.destinationLng === undefined
    ) {
      return {
        eta: undefined,
        distanceMeters: undefined,
        durationSeconds: undefined,
        arrivalAt: undefined,
      };
    }

    const distanceMeters = this.calculateDistance(
      input.lat,
      input.lng,
      input.destinationLat,
      input.destinationLng,
    );
    const durationSeconds = Math.max(60, Math.round(distanceMeters / 8.33));

    return {
      eta: this.formatDuration(durationSeconds),
      distanceMeters: Math.round(distanceMeters),
      durationSeconds,
      arrivalAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
    };
  }

  private validateGeofence(data: any, distanceMeters?: number) {
    const geofenceRadiusMeters =
      this.readOptionalNumber(data?.geofenceRadiusMeters) ?? 180;
    const geofenceRequired = data?.geofenceRequired !== false;
    const hasDestination = distanceMeters !== undefined;
    const geofenceValidated =
      !geofenceRequired ||
      !hasDestination ||
      distanceMeters <= geofenceRadiusMeters;

    if (!geofenceValidated) {
      return {
        success: false,
        allowed: false,
        error: 'GEOFENCE_REQUIRED',
        message: 'Voce ainda nao chegou ao local do servico.',
        distanceMeters,
        geofenceRadiusMeters,
        geofenceValidated: false,
      };
    }

    return {
      success: true,
      allowed: true,
      distanceMeters,
      geofenceRadiusMeters,
      geofenceValidated: geofenceRequired && hasDestination,
    };
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  }

  private formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readOptionalNumber(value: any) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
}
