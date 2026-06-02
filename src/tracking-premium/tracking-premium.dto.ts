export type TrackingMissionStatus =
  | 'WAITING_PAYMENT'
  | 'PAYMENT_PROTECTED'
  | 'PROFESSIONAL_ON_THE_WAY'
  | 'ARRIVED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'DISPUTED';

export class TrackingPremiumLocationDto {
  orderId!: string;
  userId?: string;
  role?: 'client' | 'professional' | 'admin';
  latitude!: number;
  longitude!: number;
  accuracyMeters?: number;
  heading?: number;
  speedMetersPerSecond?: number;
  timestamp?: string;
}

export class TrackingPremiumMissionDto {
  orderId!: string;
  clientId?: string;
  professionalId?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  destinationLabel?: string;
  status?: TrackingMissionStatus;
  estimatedDistanceMeters?: number;
  estimatedEtaMinutes?: number;
  metadata?: Record<string, unknown>;
}

export class TrackingPremiumActionDto {
  orderId!: string;
  userId?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  photoUrl?: string;
  note?: string;
  confirmedBySwipe?: boolean;
  metadata?: Record<string, unknown>;
}
