import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ServicesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(data: any) {
    const service = await this.prisma.serviceOrder.create({
      data,
    });

    // 🔥 DISPARA MATCHING AUTOMÁTICO
    this.eventEmitter.emit('service.created', service);

    return service;
  }

  findAll() {
    return this.prisma.serviceOrder.findMany();
  }
}