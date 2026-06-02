import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { RealtimeGateway } from '../realtime/realtime.gateway';

type OrderStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'CANCELLED';

interface OperationalOrder {
  id: string;
  serviceId: number;
  clientId?: string;
  professionalId?: string;
  professionalName?: string;
  title: string;
  description: string;
  estimatedPrice: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  startedAt?: Date;
  checkInAt?: Date;
  checkOutAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, OperationalOrder>();

  create(data: any) {
    const now = new Date();
    const order: OperationalOrder = {
      id: this.normalizeId(data?.id) || randomUUID(),
      serviceId: this.readNumber(data?.serviceId, 50),
      clientId: this.readString(data?.clientId),
      professionalId: this.readString(data?.professionalId),
      professionalName: this.readString(data?.professionalName),
      title:
        this.readString(data?.title ?? data?.serviceTitle) ||
        'Servico BoraServico',
      description: this.readString(data?.description),
      estimatedPrice: this.readNumber(
        data?.estimatedPrice ?? data?.price,
        189.9,
      ),
      status: 'CREATED',
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);
    this.emitOrderEvent(order, 'order-event', 'Ordem criada');
    this.emitStatus(order, 'order-status-updated', 'CREATED');

    return this.toPublicOrder(order);
  }

  findAll() {
    return Array.from(this.orders.values()).map((order) =>
      this.toPublicOrder(order),
    );
  }

  findOne(id: string) {
    return this.toPublicOrder(this.ensureOrder(id));
  }

  accept(id: string, professionalId?: string) {
    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'ACCEPTED';
    order.professionalId =
      this.readString(professionalId) || order.professionalId || 'pro-live';
    order.professionalName = order.professionalName || 'Profissional Bora';
    order.acceptedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'ACCEPTED');
    this.emitOrderEvent(order, 'match-found', 'Profissional encontrado');

    return this.toPublicOrder(order);
  }

  start(id: string) {
    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'IN_PROGRESS';
    order.startedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'IN_PROGRESS');
    this.emitOrderEvent(order, 'execution-started', 'Execucao iniciada');

    return this.toPublicOrder(order);
  }

  checkIn(id: string) {
    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'CHECKED_IN';
    order.checkInAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CHECKED_IN');
    this.emitOrderEvent(order, 'check-in', 'Check-in realizado');

    return this.toPublicOrder(order);
  }

  checkOut(id: string) {
    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'CHECKED_OUT';
    order.checkOutAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CHECKED_OUT');
    this.emitOrderEvent(order, 'proof-uploaded', 'Prova pronta para validacao');

    return this.toPublicOrder(order);
  }

  complete(id: string) {
    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'COMPLETED';
    order.completedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'COMPLETED');
    this.emitOrderEvent(order, 'order-completed', 'Ordem concluida');
    this.emitPaymentReleased(order);

    return this.toPublicOrder(order);
  }

  cancel(id: string) {
    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'CANCELLED';
    order.cancelledAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CANCELLED');
    this.emitOrderEvent(order, 'order-event', 'Ordem cancelada');

    return this.toPublicOrder(order);
  }

  private ensureOrder(id?: string) {
    const orderId = this.normalizeId(id) || 'BS-0505-OP';
    const existing = this.orders.get(orderId);

    if (existing) {
      return existing;
    }

    const now = new Date();
    const order: OperationalOrder = {
      id: orderId,
      serviceId: 50,
      title: 'Atendimento operacional premium',
      description: '',
      estimatedPrice: 189.9,
      status: 'CREATED',
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);
    return order;
  }

  private emitStatus(
    order: OperationalOrder,
    eventName: string,
    status: OrderStatus,
  ) {
    RealtimeGateway.emitOperational(eventName, {
      ...this.toEventPayload(order),
      status,
      message: `Status atualizado para ${status}`,
    });
  }

  private emitOrderEvent(
    order: OperationalOrder,
    eventName: string,
    message: string,
  ) {
    RealtimeGateway.emitOperational(eventName, {
      ...this.toEventPayload(order),
      message,
    });
  }

  private emitPaymentReleased(order: OperationalOrder) {
    const protectedAmount = order.estimatedPrice;
    const platformFee = this.roundCurrency(protectedAmount * 0.12);
    const releasedAmount = protectedAmount;

    RealtimeGateway.emitOperational('payment-released', {
      ...this.toEventPayload(order),
      balance: protectedAmount,
      escrow: 0,
      protectedAmount,
      platformFee,
      releasedAmount,
      statusLabel: 'Pagamento liberado com protecao',
      message: 'Pagamento liberado para repasse',
    });
  }

  private toEventPayload(order: OperationalOrder) {
    return {
      orderId: order.id,
      id: order.id,
      serviceId: order.serviceId,
      serviceTitle: order.title,
      title: order.title,
      estimatedPrice: order.estimatedPrice,
      clientId: order.clientId,
      professionalId: order.professionalId,
      professionalName: order.professionalName,
      specialty: 'Especialista Bora',
      rating: 4.96,
      timestamp: order.updatedAt.toISOString(),
    };
  }

  private toPublicOrder(order: OperationalOrder) {
    return {
      success: true,
      id: order.id,
      orderId: order.id,
      serviceId: order.serviceId,
      serviceTitle: order.title,
      title: order.title,
      description: order.description,
      status: order.status,
      clientId: order.clientId,
      professionalId: order.professionalId,
      professionalName: order.professionalName,
      estimatedPrice: order.estimatedPrice,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      acceptedAt: order.acceptedAt?.toISOString(),
      startedAt: order.startedAt?.toISOString(),
      checkInAt: order.checkInAt?.toISOString(),
      checkOutAt: order.checkOutAt?.toISOString(),
      completedAt: order.completedAt?.toISOString(),
      cancelledAt: order.cancelledAt?.toISOString(),
    };
  }

  private normalizeId(value: any) {
    return this.readString(value);
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readNumber(value: any, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }
}
