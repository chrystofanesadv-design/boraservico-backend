import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogInput {
  userId?: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  action?: string;
  entity?: string;
  entityType?: string;
  entityId?: string;
  details?: any;
  metadata?: Record<string, any>;
  ipAddress?: string;
  domain?: string;
  orderId?: string;
  paymentId?: string;
  provider?: string;
  status?: string;
  amount?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async register(action: string, input: AuditLogInput) {
    return this.log({
      action,
      entity: input.entity,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userId: input.userId,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      domain: input.domain,
      orderId: input.orderId,
      paymentId: input.paymentId,
      provider: input.provider,
      status: input.status,
      amount: input.amount,
    });
  }

  async log(input: AuditLogInput) {
    const metadata = this.cleanMetadata({
      domain: input.domain,
      userId: input.userId,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      entity: input.entity,
      entityType: input.entityType,
      entityId: input.entityId,
      ipAddress: input.ipAddress,
      details: input.details,
      ...(input.metadata ?? {}),
    });
    const logData: any = {
      action: input.action ?? 'AUDIT_EVENT',
      metadata: JSON.stringify(metadata),
    };

    if (input.orderId) logData.orderId = input.orderId;
    if (input.paymentId) logData.paymentId = input.paymentId;
    if (input.provider) logData.provider = input.provider;
    if (input.status) logData.status = input.status;
    if (input.amount !== undefined) logData.amount = input.amount;

    const log = await this.prisma.paymentAudit.create({
      data: logData,
    });

    this.logger.log(`Audit: ${logData.action}${input.entityId ? ` on ${input.entity} (${input.entityId})` : ''}`);

    return log;
  }

  async list(filters: {
    userId?: string;
    action?: string;
    actionPrefix?: string;
    orderId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};

    if (filters.userId) where.metadata = { contains: `"userId":"${filters.userId}"` };
    if (filters.action) where.action = filters.action;
    if (filters.actionPrefix) where.action = { startsWith: filters.actionPrefix };
    if (filters.orderId) where.orderId = filters.orderId;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.paymentAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      this.prisma.paymentAudit.count({ where }),
    ]);

    return {
      data: logs.map((log) => {
        const metadata = this.parseMetadata(log.metadata);

        return {
          id: log.id,
          userId: metadata?.userId,
          actorId: metadata?.actorId,
          action: log.action,
          orderId: log.orderId,
          paymentId: log.paymentId,
          provider: log.provider,
          status: log.status,
          amount: log.amount,
          metadata,
          createdAt: log.createdAt,
        };
      }),
      total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  async recentErrors(take: number = 20) {
    const logs = await this.prisma.paymentAudit.findMany({
      where: {
        action: {
          contains: 'ERROR',
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      metadata: this.parseMetadata(log.metadata),
      createdAt: log.createdAt,
    }));
  }

  async getLogs(filters: {
    userId?: string;
    action?: string;
    orderId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    return this.list(filters);
  }

  async getEntityHistory(entity: string, entityId: string) {
    const logs = await this.prisma.paymentAudit.findMany({
      where: {
        orderId: entityId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      details: this.parseMetadata(log.metadata),
      createdAt: log.createdAt,
    }));
  }

  async getUserActivity(userId: string, limit = 20) {
    const logs = await this.prisma.paymentAudit.findMany({
      where: { metadata: { contains: `"userId":"${userId}"` } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      orderId: log.orderId,
      paymentId: log.paymentId,
      details: this.parseMetadata(log.metadata),
      createdAt: log.createdAt,
    }));
  }

  private cleanMetadata(metadata: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    );
  }

  private parseMetadata(metadata: any) {
    if (!metadata) {
      return null;
    }

    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata);
      } catch {
        return metadata;
      }
    }

    return metadata;
  }
}
