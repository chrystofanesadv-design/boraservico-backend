import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PaymentsService } from '../payments/payments.service';
import { FraudService } from '../security/fraud.service';

@Injectable()
export class MatchingService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsGateway,
    private payments: PaymentsService,
    private fraudService: FraudService,
  ) {}

  // 🔥 profissionais próximos
  async findProfessionalsNearby(
    lat: number,
    lng: number,
    radiusKm = 5,
  ) {
    return this.prisma.$queryRaw<any[]>`
      SELECT 
        u.id,
        u.email,
        p.location,
        (
          6371 * acos(
            cos(radians(${lat})) *
            cos(radians(ST_Y(p.location))) *
            cos(radians(ST_X(p.location)) - radians(${lng})) +
            sin(radians(${lat})) *
            sin(radians(ST_Y(p.location)))
          )
        ) AS distance
      FROM "User" u
      INNER JOIN "Profile" p ON p."userId" = u.id
      WHERE u.role = 'PROFESSIONAL'
        AND p.location IS NOT NULL
      HAVING (
        6371 * acos(
          cos(radians(${lat})) *
          cos(radians(ST_Y(p.location))) *
          cos(radians(ST_X(p.location)) - radians(${lng})) +
          sin(radians(${lat})) *
          sin(radians(ST_Y(p.location)))
        )
      ) <= ${radiusKm}
      ORDER BY distance ASC
      LIMIT 20;
    `;
  }

  // 🚀 dispatch realtime
  async dispatchService(serviceOrder: any) {
    const lat = serviceOrder.location.y;
    const lng = serviceOrder.location.x;

    const professionals =
      await this.findProfessionalsNearby(lat, lng);

    const batchSize = 3;
    const batches: any[] = [];

    for (
      let i = 0;
      i < professionals.length;
      i += batchSize
    ) {
      batches.push(
        professionals.slice(i, i + batchSize),
      );
    }

    const payload = {
      serviceOrderId: serviceOrder.id,

      location: {
        lat,
        lng,
      },

      totalProfessionals: professionals.length,

      batches: batches.map((batch, index) => ({
        batch: index + 1,

        professionals: batch.map((p) => ({
          id: p.id,
          email: p.email,
          distance_km: Number(
            Number(p.distance).toFixed(2),
          ),
        })),
      })),
    };

    this.notifications.sendToProfessionals(
      'new-service',
      {
        type: 'NEW_SERVICE',
        payload,
      },
    );

    return payload;
  }

  // 💰 ACCEPT + ESCROW
  async acceptService(
    serviceOrderId: string,
    professionalId: string,
  ) {
    const order =
      await this.prisma.serviceOrder.findUnique({
        where: {
          id: serviceOrderId,
        },
      });

    if (!order) {
      return {
        message: 'Serviço não encontrado',
      };
    }

    // 🚫 antifraude
    await this.fraudService.validateSelfAccept(
      order.clientId,
      professionalId,
    );

    // 🔐 dupla aceitação
    if (order.professionalId) {
      return {
        message:
          'Já aceito por outro profissional',
      };
    }

    if (
      order.status !== 'CREATED' &&
      order.status !== 'MATCHING'
    ) {
      return {
        message:
          'Serviço não disponível para aceite',
      };
    }

    // 🔥 atualiza status
    const updated =
      await this.prisma.serviceOrder.update({
        where: {
          id: serviceOrderId,
        },

        data: {
          professionalId,
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

    // 💰 escrow
    try {
      await this.payments.createEscrow(
        serviceOrderId,
        order.clientId,
        Number(order.price),
      );
    } catch (err: any) {
      console.log(
        'ESCROW ERROR:',
        err.message,
      );
    }

    this.notifications.sendToAll(
      'service-accepted',
      {
        serviceOrderId,
        professionalId,
        status: 'ACCEPTED',
      },
    );

    return updated;
  }

  // 🏁 FINALIZAÇÃO
  async completeService(serviceOrderId: string) {
    const order =
      await this.prisma.serviceOrder.findUnique({
        where: {
          id: serviceOrderId,
        },
      });

    if (!order) {
      return {
        message: 'Serviço não encontrado',
      };
    }

    // 🚫 antifraude
    await this.fraudService.validateServiceCompletion(
      order.status,
    );

    if (order.status !== 'ACCEPTED') {
      return {
        message:
          'Serviço não pode ser finalizado',
      };
    }

    const updated =
      await this.prisma.serviceOrder.update({
        where: {
          id: serviceOrderId,
        },

        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

    // 💸 libera escrow
    try {
      await this.payments.releasePayment(
        serviceOrderId,
      );
    } catch (err: any) {
      console.log(
        'RELEASE ERROR:',
        err.message,
      );
    }

    this.notifications.sendToAll(
      'service-completed',
      {
        serviceOrderId,
        status: 'COMPLETED',
      },
    );

    return updated;
  }
}