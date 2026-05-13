import { Injectable } from '@nestjs/common';

type TimelineEventType =
  | 'CREATED'
  | 'MATCHING_STARTED'
  | 'PROFESSIONAL_ACCEPTED'
  | 'PROFESSIONAL_ON_THE_WAY'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTE_OPENED';

interface TimelineEvent {
  id: string;
  orderId: string;
  type: TimelineEventType;
  title: string;
  description: string;
  latitude?: number;
  longitude?: number;
  proofPhotoUrl?: string;
  createdAt: Date;
}

@Injectable()
export class TimelineService {
  private events: TimelineEvent[] = [];

  findByOrder(orderId: string) {
    return this.events
      .filter((event) => event.orderId === orderId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  createEvent(data: any) {
    const event: TimelineEvent = {
      id: crypto.randomUUID(),
      orderId: data?.orderId,
      type: data?.type ?? 'CREATED',
      title: data?.title ?? 'Evento da OS',
      description: data?.description ?? '',
      latitude: data?.latitude !== undefined ? Number(data.latitude) : undefined,
      longitude: data?.longitude !== undefined ? Number(data.longitude) : undefined,
      proofPhotoUrl: data?.proofPhotoUrl,
      createdAt: new Date(),
    };

    this.events.push(event);

    return event;
  }

  checkIn(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'CHECKED_IN',
      title: 'Profissional chegou ao local',
      description: data?.description ?? 'Check-in confirmado com localizaÃ§Ã£o GPS.',
      latitude: data?.latitude,
      longitude: data?.longitude,
    });
  }

  checkOut(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'CHECKED_OUT',
      title: 'ServiÃ§o finalizado no local',
      description: data?.description ?? 'Check-out confirmado com prova de execuÃ§Ã£o.',
      latitude: data?.latitude,
      longitude: data?.longitude,
      proofPhotoUrl: data?.proofPhotoUrl,
    });
  }

  complete(data: any) {
    return this.createEvent({
      orderId: data?.orderId,
      type: 'COMPLETED',
      title: 'OS concluÃ­da',
      description: data?.description ?? 'ServiÃ§o concluÃ­do e pronto para liberaÃ§Ã£o de pagamento.',
    });
  }

  seedDemo(orderId: string) {
    const created = this.createEvent({
      orderId,
      type: 'CREATED',
      title: 'OS criada',
      description: 'Cliente criou uma nova ordem de serviÃ§o.',
    });

    const matching = this.createEvent({
      orderId,
      type: 'MATCHING_STARTED',
      title: 'Buscando profissional',
      description: 'Matching Engine iniciou a busca por profissionais prÃ³ximos.',
    });

    const accepted = this.createEvent({
      orderId,
      type: 'PROFESSIONAL_ACCEPTED',
      title: 'Profissional aceitou',
      description: 'Profissional aceitou a ordem e estÃ¡ a caminho.',
    });

    return {
      success: true,
      events: [created, matching, accepted],
    };
  }

  findAll() {
    return this.events;
  }
}
