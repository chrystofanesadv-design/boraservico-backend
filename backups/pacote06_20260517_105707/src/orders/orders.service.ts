import { Injectable } from '@nestjs/common';

type OrderStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'CANCELLED';

interface OrderMock {
  id: string;
  serviceId?: string;
  clientId?: string;
  professionalId?: string;
  title: string;
  description: string;
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
  private orders: OrderMock[] = [];

  create(data: any) {
    const order: OrderMock = {
      id: crypto.randomUUID(),
      serviceId: data?.serviceId?.toString(),
      clientId: data?.clientId,
      professionalId: data?.professionalId,
      title: data?.title ?? 'Nova ordem de serviço',
      description: data?.description ?? '',
      status: 'CREATED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.push(order);
    return order;
  }

  findAll() {
    return this.orders;
  }

  findOne(id: string) {
    return this.orders.find((order) => order.id === id) ?? null;
  }

  accept(id: string, professionalId?: string) {
    const order = this.findOne(id);

    if (!order) {
      return {
        error: 'ORDER_NOT_FOUND',
        message: 'Ordem não encontrada',
      };
    }

    order.status = 'ACCEPTED';
    order.professionalId = professionalId ?? order.professionalId;
    order.acceptedAt = new Date();
    order.updatedAt = new Date();

    return order;
  }

  start(id: string) {
    const order = this.findOne(id);

    if (!order) {
      return {
        error: 'ORDER_NOT_FOUND',
        message: 'Ordem não encontrada',
      };
    }

    order.status = 'IN_PROGRESS';
    order.startedAt = new Date();
    order.updatedAt = new Date();

    return order;
  }

  checkIn(id: string) {
    const order = this.findOne(id);

    if (!order) {
      return {
        error: 'ORDER_NOT_FOUND',
        message: 'Ordem não encontrada',
      };
    }

    order.status = 'CHECKED_IN';
    order.checkInAt = new Date();
    order.updatedAt = new Date();

    return order;
  }

  checkOut(id: string) {
    const order = this.findOne(id);

    if (!order) {
      return {
        error: 'ORDER_NOT_FOUND',
        message: 'Ordem não encontrada',
      };
    }

    order.status = 'CHECKED_OUT';
    order.checkOutAt = new Date();
    order.updatedAt = new Date();

    return order;
  }

  complete(id: string) {
    const order = this.findOne(id);

    if (!order) {
      return {
        error: 'ORDER_NOT_FOUND',
        message: 'Ordem não encontrada',
      };
    }

    order.status = 'COMPLETED';
    order.completedAt = new Date();
    order.updatedAt = new Date();

    return order;
  }

  cancel(id: string) {
    const order = this.findOne(id);

    if (!order) {
      return {
        error: 'ORDER_NOT_FOUND',
        message: 'Ordem não encontrada',
      };
    }

    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    order.updatedAt = new Date();

    return order;
  }
}