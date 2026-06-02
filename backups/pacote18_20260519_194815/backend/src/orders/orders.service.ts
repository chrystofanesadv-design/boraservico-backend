import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FraudService } from '../fraud/fraud.service';
import { AuditService } from '../security/audit.service';

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
  category?: string;
  address?: string;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly pushRealService: PushRealService,
    private readonly fraudService: FraudService,
    private readonly auditService: AuditService,
  ) {}

  async create(data: any) {
    const persisted = await this.tryCreatePersistedOrder(data);

    if (persisted) {
      this.emitOrderEvent(persisted, 'order-event', 'Ordem criada');
      this.emitStatus(persisted, 'order-status-updated', 'CREATED');
      this.pushEvent('ORDER_CREATED', persisted);

      const fraudRisk = await this.scoreOrder(persisted, data);
      await this.auditOrder('ORDER_CREATED', persisted, data, fraudRisk);

      return this.withFraudRisk(this.toPublicOrder(persisted), fraudRisk);
    }

    const now = new Date();
    const order: OperationalOrder = {
      id: this.normalizeId(data?.id) || randomUUID(),
      serviceId: this.readNumber(data?.serviceId, 50),
      clientId: this.readString(data?.clientId),
      professionalId: this.readString(data?.professionalId),
      professionalName: this.readString(data?.professionalName),
      category: this.readString(data?.category),
      address: this.readString(data?.address),
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
    this.pushEvent('ORDER_CREATED', order);

    const fraudRisk = await this.scoreOrder(order, data);
    await this.auditOrder('ORDER_CREATED', order, data, fraudRisk);

    return this.withFraudRisk(this.toPublicOrder(order), fraudRisk);
  }

  async findAll() {
    const persisted = await this.tryFindPersistedOrders();

    if (persisted) {
      return persisted.map((order) => this.toPublicOrder(order));
    }

    return Array.from(this.orders.values()).map((order) =>
      this.toPublicOrder(order),
    );
  }

  async findOne(id: string) {
    const persisted = await this.tryFindPersistedOrder(id);

    if (persisted) {
      return this.toPublicOrder(persisted);
    }

    return this.toPublicOrder(this.ensureOrder(id));
  }

  async accept(id: string, professionalId?: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'ACCEPTED',
      professionalId: this.readString(professionalId),
      acceptedAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'ACCEPTED');
      this.emitOrderEvent(persisted, 'match-found', 'Profissional encontrado');
      this.pushEvent('PROFESSIONAL_FOUND', persisted);
      await this.auditOrder('ORDER_ACCEPTED', persisted, {
        professionalId,
      });

      return this.toPublicOrder(persisted);
    }

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
    this.pushEvent('PROFESSIONAL_FOUND', order);
    await this.auditOrder('ORDER_ACCEPTED', order, { professionalId });

    return this.toPublicOrder(order);
  }

  async professionalOnTheWay(id: string) {
    const persisted = await this.tryFindPersistedOrder(id);

    if (persisted) {
      this.emitOrderEvent(
        persisted,
        'professional-en-route',
        'Profissional a caminho',
      );
      this.pushEvent('PROFESSIONAL_ON_THE_WAY', persisted);

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    order.updatedAt = new Date();

    this.emitOrderEvent(order, 'professional-en-route', 'Profissional a caminho');
    this.pushEvent('PROFESSIONAL_ON_THE_WAY', order);

    return this.toPublicOrder(order);
  }

  async start(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'IN_PROGRESS');
      this.emitOrderEvent(persisted, 'execution-started', 'Execucao iniciada');

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'IN_PROGRESS';
    order.startedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'IN_PROGRESS');
    this.emitOrderEvent(order, 'execution-started', 'Execucao iniciada');

    return this.toPublicOrder(order);
  }

  async checkIn(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'CHECKED_IN',
      checkInAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'CHECKED_IN');
      this.emitOrderEvent(persisted, 'check-in', 'Check-in realizado');
      this.pushEvent('CHECK_IN', persisted);

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'CHECKED_IN';
    order.checkInAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CHECKED_IN');
    this.emitOrderEvent(order, 'check-in', 'Check-in realizado');
    this.pushEvent('CHECK_IN', order);

    return this.toPublicOrder(order);
  }

  async checkOut(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'CHECKED_OUT',
      checkOutAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'CHECKED_OUT');
      this.emitOrderEvent(
        persisted,
        'proof-uploaded',
        'Prova pronta para validacao',
      );

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'CHECKED_OUT';
    order.checkOutAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CHECKED_OUT');
    this.emitOrderEvent(order, 'proof-uploaded', 'Prova pronta para validacao');

    return this.toPublicOrder(order);
  }

  async complete(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'COMPLETED');
      this.emitOrderEvent(persisted, 'order-completed', 'Ordem concluida');
      this.emitPaymentReleased(persisted);
      this.pushEvent('SERVICE_COMPLETED', persisted);
      this.pushEvent('PAYMENT_RELEASED', persisted);
      await this.auditOrder('ORDER_COMPLETED', persisted);

      return {
        ...this.toPublicOrder(persisted),
        paymentRelease: await this.releasePaymentForOrder(persisted.id),
      };
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'COMPLETED';
    order.completedAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'COMPLETED');
    this.emitOrderEvent(order, 'order-completed', 'Ordem concluida');
    this.emitPaymentReleased(order);
    this.pushEvent('SERVICE_COMPLETED', order);
    this.pushEvent('PAYMENT_RELEASED', order);
    await this.auditOrder('ORDER_COMPLETED', order);

    return {
      ...this.toPublicOrder(order),
      paymentRelease: await this.releasePaymentForOrder(order.id),
    };
  }

  async cancel(id: string) {
    const persisted = await this.tryUpdatePersistedOrder(id, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });

    if (persisted) {
      this.emitStatus(persisted, 'order-status-updated', 'CANCELLED');
      this.emitOrderEvent(persisted, 'order-event', 'Ordem cancelada');
      await this.auditOrder('ORDER_CANCELLED', persisted);

      return this.toPublicOrder(persisted);
    }

    const order = this.ensureOrder(id);
    const now = new Date();

    order.status = 'CANCELLED';
    order.cancelledAt = now;
    order.updatedAt = now;

    this.emitStatus(order, 'order-status-updated', 'CANCELLED');
    this.emitOrderEvent(order, 'order-event', 'Ordem cancelada');
    await this.auditOrder('ORDER_CANCELLED', order);

    return this.toPublicOrder(order);
  }

  private async tryCreatePersistedOrder(data: any) {
    const clientId = this.readString(data?.clientId);

    if (!clientId) {
      return null;
    }

    try {
      const order = await this.prisma.serviceOrder.create({
        data: {
          id: this.normalizeId(data?.id),
          clientId,
          professionalId: this.readString(data?.professionalId),
          category: this.readString(data?.category),
          address: this.readString(data?.address),
          title:
            this.readString(data?.title ?? data?.serviceTitle) ||
            'Servico BoraServico',
          description: this.readString(data?.description) || '',
          price: this.readNumber(data?.estimatedPrice ?? data?.price, 189.9),
          status: 'CREATED',
        },
      });

      return this.fromPrismaOrder(order);
    } catch {
      return null;
    }
  }

  private async tryFindPersistedOrders() {
    try {
      const orders = await this.prisma.serviceOrder.findMany({
        orderBy: {
          createdAt: 'desc',
        },
      });

      return orders.map((order) => this.fromPrismaOrder(order));
    } catch {
      return null;
    }
  }

  private async tryFindPersistedOrder(id?: string) {
    const orderId = this.normalizeId(id);

    if (!orderId) {
      return null;
    }

    try {
      const order = await this.prisma.serviceOrder.findUnique({
        where: { id: orderId },
      });

      return order ? this.fromPrismaOrder(order) : null;
    } catch {
      return null;
    }
  }

  private async tryUpdatePersistedOrder(id: string, data: Record<string, any>) {
    const orderId = this.normalizeId(id);

    if (!orderId) {
      return null;
    }

    try {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );

      const order = await this.prisma.serviceOrder.update({
        where: { id: orderId },
        data: cleanData,
      });

      return this.fromPrismaOrder(order);
    } catch {
      return null;
    }
  }

  private fromPrismaOrder(order: any): OperationalOrder {
    return {
      id: order.id,
      serviceId: 50,
      clientId: order.clientId,
      professionalId: order.professionalId ?? undefined,
      title: order.title,
      description: order.description ?? '',
      category: order.category ?? undefined,
      address: order.address ?? undefined,
      estimatedPrice: this.readNumber(order.price, 0),
      status: this.normalizeStatus(order.status),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt ?? order.createdAt,
      acceptedAt: order.acceptedAt ?? undefined,
      startedAt: order.startedAt ?? undefined,
      checkInAt: order.checkInAt ?? undefined,
      checkOutAt: order.checkOutAt ?? undefined,
      completedAt: order.completedAt ?? undefined,
      cancelledAt: order.cancelledAt ?? undefined,
    };
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

  private pushEvent(
    eventType:
      | 'ORDER_CREATED'
      | 'PROFESSIONAL_FOUND'
      | 'PROFESSIONAL_ON_THE_WAY'
      | 'CHECK_IN'
      | 'PAYMENT_RELEASED'
      | 'SERVICE_COMPLETED',
    order: OperationalOrder,
  ) {
    void this.pushRealService
      .notifyOrderEvent(eventType, this.toEventPayload(order))
      .catch(() => undefined);
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
      category: order.category,
      address: order.address,
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

  private normalizeStatus(value: any): OrderStatus {
    const status = this.readString(value)?.toUpperCase();

    if (status === 'CANCELED') {
      return 'CANCELLED';
    }

    const allowed: OrderStatus[] = [
      'CREATED',
      'ACCEPTED',
      'IN_PROGRESS',
      'CHECKED_IN',
      'CHECKED_OUT',
      'COMPLETED',
      'CANCELLED',
    ];

    return allowed.includes(status as OrderStatus)
      ? (status as OrderStatus)
      : 'CREATED';
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async scoreOrder(order: OperationalOrder, data: any) {
    try {
      return await this.fraudService.analyzeOrder(
        {
          ...data,
          orderId: order.id,
          clientId: order.clientId,
          professionalId: order.professionalId,
          title: order.title,
          address: order.address,
          amount: order.estimatedPrice,
        },
        {
          userId: order.clientId,
        },
      );
    } catch {
      return undefined;
    }
  }

  private async auditOrder(
    action: string,
    order: OperationalOrder,
    data: any = {},
    fraudRisk?: any,
  ) {
    await this.auditService.register(action, {
      domain: 'orders',
      actorId: this.readString(data?.actorId ?? data?.clientId ?? order.clientId),
      entityType: 'order',
      entityId: order.id,
      orderId: order.id,
      amount: order.estimatedPrice,
      metadata: {
        status: order.status,
        professionalId: order.professionalId,
        fraudRisk: this.publicFraudRisk(fraudRisk),
      },
    });
  }

  private withFraudRisk(order: Record<string, any>, fraudRisk?: any) {
    return {
      ...order,
      fraudRisk: this.publicFraudRisk(fraudRisk),
    };
  }

  private publicFraudRisk(fraudRisk?: any) {
    if (!fraudRisk) {
      return undefined;
    }

    return {
      score: fraudRisk.riskScore ?? fraudRisk.score,
      level: fraudRisk.riskLevel ?? fraudRisk.level,
      approved: fraudRisk.approved,
      reasons: fraudRisk.reasons,
    };
  }

  private async releasePaymentForOrder(orderId: string) {
    try {
      return await this.paymentsService.releaseForOrder(orderId);
    } catch (error) {
      return {
        success: false,
        released: false,
        orderId,
        error: 'PAYMENT_RELEASE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao liberar pagamento da ordem',
      };
    }
  }
}
