import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../security/audit.service';

type RiskLevel = 'baixo' | 'medio' | 'alto' | 'critico';

type RiskSignal = {
  code: string;
  weight: number;
  message: string;
  metadata?: Record<string, any>;
};

@Injectable()
export class FraudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async analyze(data: any, actor: any = {}) {
    const type = this.inferType(data);
    const signals: RiskSignal[] = [];

    signals.push(...this.basicSignals(data));

    if (type === 'order') {
      signals.push(...(await this.orderSignals(data)));
    }

    if (type === 'payment') {
      signals.push(...(await this.paymentSignals(data)));
    }

    if (type === 'referral') {
      signals.push(...(await this.referralSignals(data)));
    }

    if (type === 'withdrawal') {
      signals.push(...(await this.withdrawalSignals(data)));
    }

    if (type === 'webhook') {
      signals.push(...(await this.webhookSignals(data)));
    }

    const score = this.clampScore(
      signals.reduce((total, signal) => total + signal.weight, 5),
    );
    const riskLevel = this.levelForScore(score);
    const result = {
      success: true,
      approved: score < 85,
      type,
      score,
      riskScore: score,
      riskLevel,
      level: riskLevel,
      reasons: signals.map((signal) => signal.message),
      signals,
      createdAt: new Date().toISOString(),
    };

    await this.auditService.register('FRAUD_RISK_ASSESSED', {
      domain: 'antifraude',
      actorId: this.readString(actor?.actorId ?? actor?.userId ?? data?.userId),
      actorEmail: this.readString(actor?.actorEmail ?? actor?.email),
      entityType: type,
      entityId: this.readString(
        data?.entityId ??
          data?.orderId ??
          data?.paymentId ??
          data?.referralId ??
          data?.providerEventId,
      ),
      orderId: this.readString(data?.orderId),
      paymentId: this.readString(data?.paymentId),
      provider: this.readString(data?.provider),
      amount: this.readAmount(data?.amount ?? data?.serviceValue),
      metadata: {
        ...result,
        input: this.safeInput(data),
      },
    });

    return result;
  }

  analyzeOrder(data: any, actor: any = {}) {
    return this.analyze({ ...data, type: 'order' }, actor);
  }

  analyzePayment(data: any, actor: any = {}) {
    return this.analyze({ ...data, type: 'payment' }, actor);
  }

  analyzeReferral(data: any, actor: any = {}) {
    return this.analyze({ ...data, type: 'referral' }, actor);
  }

  analyzeWithdrawal(data: any, actor: any = {}) {
    return this.analyze({ ...data, type: 'withdrawal' }, actor);
  }

  analyzeWebhook(data: any, actor: any = {}) {
    return this.analyze({ ...data, type: 'webhook' }, actor);
  }

  async averageRisk(take = 200) {
    const audits = await this.prisma.paymentAudit.findMany({
      where: {
        action: {
          startsWith: 'FRAUD_',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 500),
    });
    const scores = audits
      .map((audit) => {
        const metadata = this.readObject(audit.metadata);
        const nested = this.readObject(metadata.metadata);

        return Number(
          metadata.riskScore ?? metadata.score ?? nested.riskScore ?? nested.score,
        );
      })
      .filter((score) => Number.isFinite(score));
    const average = scores.length
      ? this.round(scores.reduce((total, score) => total + score, 0) / scores.length)
      : 0;

    return {
      score: average,
      riskScore: average,
      riskLevel: this.levelForScore(average),
      level: this.levelForScore(average),
      samples: scores.length,
    };
  }

  async recentEvents(take = 100) {
    const events = await this.prisma.paymentAudit.findMany({
      where: {
        action: {
          startsWith: 'FRAUD_',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 500),
    });

    return events.map((event) => ({
      id: event.id,
      action: event.action,
      orderId: event.orderId,
      paymentId: event.paymentId,
      provider: event.provider,
      amount: event.amount === null ? undefined : Number(event.amount ?? 0),
      metadata: event.metadata,
      createdAt: event.createdAt,
    }));
  }

  private basicSignals(data: any): RiskSignal[] {
    const signals: RiskSignal[] = [];
    const amount = this.readAmount(data?.amount ?? data?.price ?? data?.serviceValue);

    if (amount >= 10000) {
      signals.push({
        code: 'VERY_HIGH_AMOUNT',
        weight: 40,
        message: 'Valor muito alto para fluxo comum',
        metadata: { amount },
      });
    } else if (amount >= 3000) {
      signals.push({
        code: 'HIGH_AMOUNT',
        weight: 20,
        message: 'Valor alto para fluxo comum',
        metadata: { amount },
      });
    }

    if (this.readString(data?.clientId) && data?.clientId === data?.professionalId) {
      signals.push({
        code: 'SELF_SERVICE',
        weight: 65,
        message: 'Cliente e profissional apontam para o mesmo usuario',
      });
    }

    return signals;
  }

  private async orderSignals(data: any): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const clientId = this.readString(data?.clientId ?? data?.userId);
    const title = this.readString(data?.title ?? data?.serviceTitle);
    const address = this.readString(data?.address);

    if (!clientId) {
      signals.push({
        code: 'ORDER_WITHOUT_CLIENT',
        weight: 20,
        message: 'Ordem sem clientId confiavel',
      });
      return signals;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOrders = await this.prisma.serviceOrder.count({
      where: {
        clientId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOrders >= 5) {
      signals.push({
        code: 'ORDER_FREQUENCY_CRITICAL',
        weight: 45,
        message: 'Cliente criou muitas ordens na ultima hora',
        metadata: { recentOrders },
      });
    } else if (recentOrders >= 3) {
      signals.push({
        code: 'ORDER_FREQUENCY_MEDIUM',
        weight: 20,
        message: 'Cliente criou ordens repetidas em curto intervalo',
        metadata: { recentOrders },
      });
    }

    if (title || address) {
      const similarOrders = await this.prisma.serviceOrder.count({
        where: {
          clientId,
          createdAt: { gte: lastDay },
          OR: [
            ...(title ? [{ title: { equals: title, mode: 'insensitive' } }] : []),
            ...(address
              ? [{ address: { equals: address, mode: 'insensitive' } }]
              : []),
          ] as any,
        },
      });

      if (similarOrders >= 2) {
        signals.push({
          code: 'ORDER_REPETITION',
          weight: 25,
          message: 'Ordem repetida por titulo ou endereco nas ultimas 24h',
          metadata: { similarOrders },
        });
      }
    }

    return signals;
  }

  private async paymentSignals(data: any): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const orderId = this.readString(data?.orderId);
    const providerPaymentId = this.readString(data?.providerPaymentId);

    if (!orderId) {
      signals.push({
        code: 'PAYMENT_WITHOUT_ORDER',
        weight: 25,
        message: 'Pagamento sem orderId',
      });
    } else {
      const duplicatePayments = await this.prisma.payment.count({
        where: {
          orderId,
          status: {
            in: ['PENDING', 'AUTHORIZED', 'PAID', 'ESCROW_HELD'] as any,
          },
        },
      });

      if (duplicatePayments >= 2) {
        signals.push({
          code: 'PAYMENT_DUPLICATED_ORDER',
          weight: 40,
          message: 'Ordem possui pagamentos ativos repetidos',
          metadata: { duplicatePayments },
        });
      }
    }

    if (providerPaymentId) {
      const duplicatedProviderId = await this.prisma.payment.count({
        where: { providerPaymentId },
      });

      if (duplicatedProviderId > 0) {
        signals.push({
          code: 'PAYMENT_PROVIDER_ID_DUPLICATED',
          weight: 55,
          message: 'providerPaymentId ja registrado',
          metadata: { providerPaymentId },
        });
      }
    }

    return signals;
  }

  private async referralSignals(data: any): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const referrerId = this.readString(data?.referrerId);
    const referredUserId = this.readString(data?.referredUserId ?? data?.userId);

    if (!referrerId || !referredUserId) {
      signals.push({
        code: 'REFERRAL_INCOMPLETE',
        weight: 20,
        message: 'Indicacao sem referrerId ou referredUserId',
      });
      return signals;
    }

    if (referrerId === referredUserId) {
      signals.push({
        code: 'REFERRAL_SELF',
        weight: 90,
        message: 'Autoindicacao detectada',
      });
    }

    const [samePair, activeForReferred, recentByReferrer] = await Promise.all([
      this.prisma.referral.count({
        where: { referrerId, referredUserId },
      }),
      this.prisma.referral.count({
        where: {
          referredUserId,
          status: { in: ['PHASE_1', 'PHASE_2'] as any },
        },
      }),
      this.prisma.referral.count({
        where: {
          referrerId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    if (samePair > 0) {
      signals.push({
        code: 'REFERRAL_DUPLICATED_PAIR',
        weight: 50,
        message: 'Par de indicacao ja existente',
      });
    }

    if (activeForReferred > 0) {
      signals.push({
        code: 'REFERRAL_DUPLICATED_REFERRED',
        weight: 35,
        message: 'Usuario indicado ja possui indicacao ativa',
      });
    }

    if (recentByReferrer >= 10) {
      signals.push({
        code: 'REFERRAL_FREQUENCY_HIGH',
        weight: 30,
        message: 'Indicador criou muitas indicacoes em 24h',
        metadata: { recentByReferrer },
      });
    }

    return signals;
  }

  private async withdrawalSignals(data: any): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const userId = this.readString(data?.userId);
    const amount = this.readAmount(data?.amount);

    if (!userId) {
      signals.push({
        code: 'WITHDRAWAL_WITHOUT_USER',
        weight: 30,
        message: 'Saque sem userId',
      });
      return signals;
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    const availableBalance = Number(wallet?.availableBalance ?? 0);

    if (amount > availableBalance) {
      signals.push({
        code: 'WITHDRAWAL_ABOVE_BALANCE',
        weight: 80,
        message: 'Saque solicitado acima do saldo disponivel',
        metadata: { amount, availableBalance },
      });
    }

    if (amount >= 2000) {
      signals.push({
        code: 'WITHDRAWAL_HIGH_AMOUNT',
        weight: 35,
        message: 'Saque PIX de alto valor',
        metadata: { amount },
      });
    }

    const recentWithdrawals = await this.prisma.walletTransaction.findMany({
      where: {
        userId,
        type: 'PIX_WITHDRAWAL',
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      take: 100,
    });
    const recentAmount = recentWithdrawals.reduce(
      (total, item) => total + Number(item.amount ?? 0),
      0,
    );

    if (recentWithdrawals.length >= 3) {
      signals.push({
        code: 'WITHDRAWAL_REPETITION',
        weight: 30,
        message: 'Repeticao suspeita de saques PIX em 24h',
        metadata: { count: recentWithdrawals.length },
      });
    }

    if (recentAmount + amount >= 3000) {
      signals.push({
        code: 'WITHDRAWAL_DAILY_VOLUME',
        weight: 30,
        message: 'Volume diario de saques elevado',
        metadata: { recentAmount, requestedAmount: amount },
      });
    }

    return signals;
  }

  private async webhookSignals(data: any): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const provider = this.normalizeProvider(data?.provider);
    const providerEventId = this.readString(data?.providerEventId);

    if (!providerEventId) {
      signals.push({
        code: 'WEBHOOK_WITHOUT_EVENT_ID',
        weight: 40,
        message: 'Webhook sem identificador idempotente',
      });
      return signals;
    }

    const duplicate = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: provider as any,
          providerEventId,
        },
      },
    });

    if (duplicate) {
      signals.push({
        code: 'WEBHOOK_DUPLICATED',
        weight: 90,
        message: 'Webhook duplicado detectado',
        metadata: {
          provider,
          providerEventId,
          existingStatus: duplicate.status,
        },
      });
    }

    if (!this.readString(data?.providerPaymentId)) {
      signals.push({
        code: 'WEBHOOK_WITHOUT_PAYMENT_ID',
        weight: 15,
        message: 'Webhook sem providerPaymentId',
      });
    }

    return signals;
  }

  private inferType(data: any) {
    const explicit = this.readString(data?.type ?? data?.domain ?? data?.entityType)
      ?.toLowerCase()
      .replace(/-/g, '_');

    if (explicit?.includes('withdraw')) {
      return 'withdrawal';
    }

    if (
      explicit === 'order' ||
      explicit === 'payment' ||
      explicit === 'referral' ||
      explicit === 'webhook' ||
      explicit === 'withdrawal'
    ) {
      return explicit;
    }

    if (data?.providerEventId || data?.webhook) {
      return 'webhook';
    }

    if (data?.pixKey || data?.pixKeyType) {
      return 'withdrawal';
    }

    if (data?.referrerId || data?.referredUserId || data?.referralCode) {
      return 'referral';
    }

    if (data?.paymentId || data?.providerPaymentId || data?.provider) {
      return 'payment';
    }

    return 'order';
  }

  private normalizeProvider(value: any) {
    const provider = this.readString(value)
      ?.toUpperCase()
      .replace(/[.\-\s]+/g, '_');

    if (provider === 'MP' || provider === 'MERCADOPAGO') {
      return 'MERCADO_PAGO';
    }

    if (provider === 'PAGAR_ME') {
      return 'PAGARME';
    }

    return provider ?? 'MERCADO_PAGO';
  }

  private levelForScore(score: number): RiskLevel {
    if (score >= 90) {
      return 'critico';
    }

    if (score >= 70) {
      return 'alto';
    }

    if (score >= 40) {
      return 'medio';
    }

    return 'baixo';
  }

  private clampScore(score: number) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private safeInput(data: any) {
    const input = this.readObject(data);
    const copy = { ...input };

    for (const key of ['password', 'token', 'authorization', 'rawBody']) {
      if (key in copy) {
        copy[key] = '[redacted]';
      }
    }

    if (copy.pixKey) {
      copy.pixKey = this.mask(copy.pixKey);
    }

    return copy;
  }

  private mask(value: any) {
    const text = this.readString(value) ?? '';

    if (text.length <= 6) {
      return '*'.repeat(text.length);
    }

    return `${text.slice(0, 3)}***${text.slice(-3)}`;
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

  private readAmount(value: any) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private round(value: number) {
    return Math.round(value * 100) / 100;
  }
}
