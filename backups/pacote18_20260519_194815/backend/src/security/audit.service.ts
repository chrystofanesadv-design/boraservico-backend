import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type AuditListOptions = {
  take?: number;
  actionPrefix?: string;
  domain?: string;
};

@Injectable()
export class AuditService {
  private readonly fallbackLogs: any[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async register(action: string, payload: any = {}) {
    const log = {
      id: `audit_${Date.now()}_${Math.round(Math.random() * 1e9)}`,
      action: this.requireAction(action),
      domain: this.readString(payload?.domain) ?? 'system',
      actorId: this.readString(payload?.actorId ?? payload?.userId),
      actorEmail: this.readString(payload?.actorEmail ?? payload?.email),
      entityType: this.readString(payload?.entityType),
      entityId: this.readString(payload?.entityId),
      paymentId: this.readString(payload?.paymentId),
      orderId: this.readString(payload?.orderId),
      provider: this.normalizeProvider(payload?.provider),
      status: this.normalizePaymentStatus(payload?.status),
      amount: this.readAmount(payload?.amount),
      metadata: this.cleanMetadata({
        ...this.redact(payload),
        persistedVia: 'PaymentAudit',
      }),
      createdAt: new Date().toISOString(),
    };

    try {
      const persisted = await this.prisma.paymentAudit.create({
        data: {
          paymentId: log.paymentId,
          orderId: log.orderId,
          provider: log.provider as any,
          action: log.action,
          status: log.status as any,
          amount: log.amount,
          metadata: log.metadata,
        },
      });

      return this.toPublicAudit(persisted, true);
    } catch (error) {
      const fallback = {
        ...log,
        persisted: false,
        persistenceError:
          error instanceof Error ? error.message : 'AUDIT_PERSIST_FAILED',
      };

      this.fallbackLogs.unshift(fallback);
      this.fallbackLogs.splice(200);

      return fallback;
    }
  }

  async list(options: AuditListOptions = {}) {
    const take = this.normalizeTake(options.take, 100);
    const where: any = {};

    if (options.actionPrefix) {
      where.action = {
        startsWith: options.actionPrefix,
      };
    }

    try {
      const persisted = await this.prisma.paymentAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
      });
      const publicAudits = persisted.map((audit) =>
        this.toPublicAudit(audit, true),
      );
      const filtered =
        options.domain !== undefined
          ? publicAudits.filter((audit) => audit.domain === options.domain)
          : publicAudits;

      return [...filtered, ...this.fallbackLogs].slice(0, take);
    } catch {
      return this.fallbackLogs.slice(0, take);
    }
  }

  async recentErrors(take = 50) {
    return this.list({
      take,
      actionPrefix: 'OBS_ERROR',
    });
  }

  private toPublicAudit(audit: any, persisted: boolean) {
    const metadata = this.readObject(audit.metadata);

    return {
      id: audit.id,
      persisted,
      action: audit.action,
      domain: this.readString(metadata.domain) ?? 'system',
      actorId: this.readString(metadata.actorId ?? metadata.userId),
      actorEmail: this.readString(metadata.actorEmail ?? metadata.email),
      entityType: this.readString(metadata.entityType),
      entityId: this.readString(metadata.entityId),
      paymentId: audit.paymentId,
      orderId: audit.orderId,
      provider: audit.provider,
      status: audit.status,
      amount: audit.amount === null ? undefined : Number(audit.amount ?? 0),
      metadata,
      createdAt: audit.createdAt,
    };
  }

  private requireAction(value: any) {
    return this.readString(value) ?? 'AUDIT_EVENT';
  }

  private normalizeProvider(value: any) {
    const provider = this.readString(value)
      ?.toUpperCase()
      .replace(/[-.\s]+/g, '_');
    const allowed = [
      'MERCADO_PAGO',
      'PAGARME',
      'PIX',
      'STRIPE',
      'MANUAL',
      'MOCK',
    ];

    return allowed.includes(provider ?? '') ? provider : undefined;
  }

  private normalizePaymentStatus(value: any) {
    const status = this.readString(value)?.toUpperCase();
    const allowed = [
      'PENDING',
      'AUTHORIZED',
      'PAID',
      'ESCROW_HELD',
      'RELEASED',
      'REFUNDED',
      'PARTIAL_REFUND',
      'SPLIT_DONE',
      'CANCELED',
      'FAILED',
    ];

    return allowed.includes(status ?? '') ? status : undefined;
  }

  private readAmount(value: any) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : undefined;
  }

  private normalizeTake(value: any, fallback: number) {
    const take = Number(value ?? fallback);
    return Number.isFinite(take) ? Math.min(Math.max(take, 1), 500) : fallback;
  }

  private redact(payload: any) {
    const copy = this.readObject(payload);

    for (const key of ['password', 'token', 'access_token', 'authorization']) {
      if (key in copy) {
        copy[key] = '[redacted]';
      }
    }

    return copy;
  }

  private cleanMetadata(metadata: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    );
  }

  private readObject(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
