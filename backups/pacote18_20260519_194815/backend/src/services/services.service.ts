import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(data: any) {
    const service = await this.prisma.serviceOrder.create({
      data: {
        title: data.title ?? data.name ?? 'Serviço sem título',
        description: data.description ?? '',
        category: data.category ?? data.serviceCategory ?? null,
        address: data.address ?? data.serviceAddress ?? null,
        price: data.price
          ? Number(data.price)
          : data.budget
            ? Number(data.budget)
            : 0,
        client: {
          connect: {
            id: data.clientId,
          },
        },
      },
    });

    this.eventEmitter.emit('service.created', service);

    return service;
  }

  async findAll() {
    return this.prisma.serviceOrder.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        client: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            fcmToken: true,
          },
        },
      },
    });
  }
}
