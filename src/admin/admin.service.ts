import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { FraudService } from '../fraud/fraud.service';
import {
  getPlatformCommissionRate,
  getPublicEnvReadiness,
} from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../security/audit.service';

type AdminActor = {
  userId?: string;
  id?: string;
  email?: string;
  role?: string;
};

@Injectable()
export class AdminService {
  private readonly platformCommissionRate = getPlatformCommissionRate();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly fraudService: FraudService,
  ) {}

  status() {
    return {
      success: true,
      module: 'admin',
      protected: true,
      rbac: {
        adminGuard: true,
        roleRequired: 'ADMIN',
      },
      capabilities: [
        'dashboard',
        'users',
        'professionals',
        'orders',
        'payments',
        'disputes',
        'audit',
        'fraud',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  async dashboard() {
    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      reachableUsers,
      totalProfessionals,
      totalClients,
      totalOrders,
      openOrders,
      completedOrders,
      financialVolume,
      platformRevenue,
      escrowHeld,
      walletEscrow,
      pendingPayments,
      releasedPayments,
      failedPayments24h,
      webhookFailures24h,
      pendingPixWithdrawals,
      openDisputes,
      fraudRisk,
      realtimeEvents,
      recentErrors,
      ordersByStatus,
      paymentsByStatus,
      recentTrackingEvents,
      aiMatchingEvents24h,
      newUsers7d,
      orders7d,
      revenue7d,
      recentGrowthOrders,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { fcmToken: { not: null } } }),
      this.prisma.user.count({ where: { role: 'PROFESSIONAL' } }),
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.serviceOrder.count(),
      this.prisma.serviceOrder.count({
        where: {
          status: {
            in: [
              'CREATED',
              'MATCHING',
              'ACCEPTED',
              'IN_PROGRESS',
              'CHECKED_IN',
              'CHECKED_OUT',
            ] as any,
          },
        },
      }),
      this.prisma.serviceOrder.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        where: {
          status: {
            in: ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'] as any,
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: {
            in: ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'] as any,
          },
        },
        _sum: { commission: true },
      }),
      this.prisma.escrow.aggregate({
        where: { status: 'HELD' },
        _sum: { amount: true },
      }),
      this.prisma.wallet.aggregate({
        _sum: { escrowBalance: true },
      }),
      this.prisma.payment.count({
        where: { status: { in: ['PENDING', 'AUTHORIZED'] as any } },
      }),
      this.prisma.payment.count({ where: { status: 'RELEASED' } }),
      this.prisma.payment.count({
        where: { status: 'FAILED', createdAt: { gte: lastDay } },
      }),
      this.prisma.paymentWebhookEvent.count({
        where: { status: 'FAILED', createdAt: { gte: lastDay } },
      }),
      this.countPendingPixWithdrawals(),
      this.prisma.dispute.count({
        where: { status: { not: 'RESOLVED' } },
      }),
      this.fraudService.averageRisk(200),
      this.realtimeEvents(lastHour),
      this.auditService.recentErrors(20),
      this.prisma.serviceOrder.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true, commission: true },
      }),
      this.prisma.trackingEvent.findMany({
        where: { timestamp: { gte: lastHour } },
        orderBy: { timestamp: 'desc' },
        take: 24,
        include: {
          order: {
            select: {
              id: true,
              category: true,
              address: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.operationalTimelineEvent.count({
        where: {
          type: 'MATCHING_STARTED',
          timestamp: { gte: lastDay },
        },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: lastWeek } } }),
      this.prisma.serviceOrder.count({
        where: { createdAt: { gte: lastWeek } },
      }),
      this.prisma.payment.aggregate({
        where: {
          createdAt: { gte: lastWeek },
          status: {
            in: ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'] as any,
          },
        },
        _sum: { amount: true, commission: true },
      }),
      this.prisma.serviceOrder.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          status: true,
          category: true,
          address: true,
          price: true,
          clientId: true,
          professionalId: true,
          createdAt: true,
          acceptedAt: true,
          completedAt: true,
          cancelledAt: true,
        },
      }),
    ]);
    const protectedTotal = this.roundCurrency(
      this.toNumber(escrowHeld._sum.amount) +
        this.toNumber(walletEscrow._sum.escrowBalance),
    );
    const revenueTotal = this.toNumber(financialVolume._sum.amount);
    const platformRevenueTotal = this.toNumber(platformRevenue._sum.commission);
    const env = getPublicEnvReadiness();
    const growthDashboard = this.buildGrowthDashboard({
      orders: recentGrowthOrders,
      totalOrders,
      openOrders,
      completedOrders,
      pendingPayments,
      releasedPayments,
      platformRevenueTotal,
      revenueTotal,
      newUsers7d,
      fraudRisk,
    });

    return {
      success: true,
      generatedAt: now.toISOString(),
      window: {
        realtimeSince: lastHour.toISOString(),
        operationalSince: lastDay.toISOString(),
      },
      metrics: {
        totalUsers,
        reachableUsers,
        totalProfessionals,
        totalClients,
        totalOrders,
        openOrders,
        completedOrders,
        financialVolume: revenueTotal,
        platformRevenue: platformRevenueTotal,
        escrowBalance: {
          escrowTable: this.toNumber(escrowHeld._sum.amount),
          walletEscrow: this.toNumber(walletEscrow._sum.escrowBalance),
          total: protectedTotal,
        },
        pendingPayments,
        releasedPayments,
        failedPayments24h,
        webhookFailures24h,
        pendingPixWithdrawals,
        openDisputes,
        averageFraudRisk: fraudRisk,
        realtimeEvents,
        recentErrorsCount: recentErrors.length,
      },
      financial: {
        commissionRate: this.platformCommissionRate,
        platformSharePercent: Math.round(this.platformCommissionRate * 100),
        professionalSharePercent: Math.round(
          (1 - this.platformCommissionRate) * 100,
        ),
        revenueTotal,
        platformRevenue: platformRevenueTotal,
        professionalReceivable: this.roundCurrency(
          revenueTotal - platformRevenueTotal,
        ),
        protectedBalance: protectedTotal,
        pendingPayments,
        pendingPixWithdrawals,
      },
      charts: {
        growth: [
          { label: 'Novos usuarios 7d', value: newUsers7d },
          { label: 'Ordens 7d', value: orders7d },
          {
            label: 'Receita 7d',
            value: this.toNumber(revenue7d._sum.amount),
          },
          {
            label: 'Comissao 7d',
            value: this.toNumber(revenue7d._sum.commission),
          },
        ],
        ordersByStatus: this.groupCounts(ordersByStatus),
        paymentsByStatus: this.paymentGroups(paymentsByStatus),
      },
      operationalMap: recentTrackingEvents.map((event) => ({
        orderId: event.orderId,
        status: event.status,
        latitude: event.lat,
        longitude: event.lng,
        category: event.order?.category,
        orderStatus: event.order?.status,
        address: event.order?.address,
        updatedAt: event.timestamp,
      })),
      funnel: [
        { label: 'Ordens criadas', value: totalOrders },
        { label: 'Orcamentos aceitos', value: growthDashboard.funnel.acceptedBudgets },
        { label: 'Orcamentos recusados', value: growthDashboard.funnel.rejectedBudgets },
        { label: 'Propostas enviadas', value: growthDashboard.funnel.sentProposals },
        { label: 'Propostas aceitas', value: growthDashboard.funnel.acceptedProposals },
        { label: 'Ordens ativas', value: openOrders },
        { label: 'Concluidas', value: completedOrders },
        { label: 'Pagamentos liberados', value: releasedPayments },
      ],
      growthDashboard,
      antifraud: {
        averageRisk: fraudRisk,
        openDisputes,
        paymentFailures24h: failedPayments24h,
        webhookFailures24h,
        recentErrors: recentErrors.length,
      },
      aiMetrics: {
        pricingAndMatching24h: aiMatchingEvents24h,
        averageRisk: fraudRisk,
        operationalProtection: true,
      },
      alerts: this.dashboardAlerts({
        env,
        pendingPayments,
        pendingPixWithdrawals,
        openDisputes,
        webhookFailures24h,
        failedPayments24h,
        recentErrorsCount: recentErrors.length,
      }),
      monitoring: {
        realtime: realtimeEvents,
        usersReachableByApp: reachableUsers,
        productionReady: env.productionReady,
        paymentProvidersReady: env.payments,
      },
    };
  }

  async realtimeDashboard() {
    return {
      success: true,
      realtimeEvents: await this.realtimeEvents(
        new Date(Date.now() - 60 * 60 * 1000),
      ),
    };
  }

  async systemStatus() {
    const database = await this.databaseStatus();
    const dashboard = database.ok ? await this.dashboard() : undefined;
    const env = getPublicEnvReadiness();

    return {
      success: true,
      productionReady: database.ok && env.productionReady,
      database,
      env,
      admin: this.status(),
      dashboard: dashboard?.metrics,
      timestamp: new Date().toISOString(),
    };
  }

  async listUsers(query: any) {
    const pagination = this.pagination(query);
    const where: any = {};
    const role = this.normalizeRole(query?.role);
    const search = this.readString(query?.search);

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        select: this.userSelect(),
      }),
    ]);

    return { success: true, total, ...pagination, items };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.userSelect(),
        wallet: true,
        reputationProfile: true,
        _count: {
          select: {
            createdOrders: true,
            acceptedOrders: true,
            referralsMade: true,
            referralsReceived: true,
            walletTransactions: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return { success: true, user };
  }

  async updateUser(id: string, body: any, actor: AdminActor) {
    const data = this.cleanData({
      name: this.readString(body?.name),
      email: this.readString(body?.email),
      fcmToken: this.readString(body?.fcmToken),
      role: this.normalizeRole(body?.role),
    });

    if (!Object.keys(data).length) {
      throw new BadRequestException('Nenhum campo permitido para atualizar');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect(),
    });

    await this.auditAdmin(actor, 'ADMIN_USER_UPDATED', {
      entityType: 'user',
      entityId: id,
      metadata: { changedFields: Object.keys(data) },
    });

    return { success: true, user };
  }

  async listProfessionals(query: any) {
    return this.listUsers({
      ...query,
      role: 'PROFESSIONAL',
    });
  }

  async getProfessional(id: string) {
    const professional = await this.prisma.user.findFirst({
      where: {
        id,
        role: 'PROFESSIONAL',
      },
      select: {
        ...this.userSelect(),
        reputationProfile: true,
        acceptedOrders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        wallet: true,
      },
    });

    if (!professional) {
      throw new NotFoundException('Profissional nao encontrado');
    }

    return { success: true, professional };
  }

  async listOrders(query: any) {
    const pagination = this.pagination(query);
    const where: any = {};
    const status = this.normalizeOrderStatus(query?.status);

    if (status) {
      where.status = status;
    }

    const [total, items] = await Promise.all([
      this.prisma.serviceOrder.count({ where }),
      this.prisma.serviceOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          client: { select: this.userSelect() },
          professional: { select: this.userSelect() },
          escrow: true,
          dispute: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
    ]);

    return { success: true, total, ...pagination, items };
  }

  async getOrder(id: string) {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        client: { select: this.userSelect() },
        professional: { select: this.userSelect() },
        escrow: true,
        dispute: true,
        trackingEvents: { orderBy: { timestamp: 'desc' }, take: 20 },
        timelineEvents: { orderBy: { timestamp: 'desc' }, take: 20 },
        walletTransactions: { orderBy: { timestamp: 'desc' }, take: 20 },
        proofUploads: { orderBy: { createdAt: 'desc' }, take: 20 },
        chatMessages: { orderBy: { createdAt: 'desc' }, take: 20 },
        reviews: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      throw new NotFoundException('Ordem nao encontrada');
    }

    return { success: true, order };
  }

  async updateOrderStatus(id: string, body: any, actor: AdminActor) {
    const status = this.normalizeOrderStatus(body?.status);

    if (!status) {
      throw new BadRequestException('Status de ordem invalido');
    }

    const timestampField = this.orderTimestampField(status);
    const order = await this.prisma.serviceOrder.update({
      where: { id },
      data: this.cleanData({
        status,
        [timestampField]: timestampField ? new Date() : undefined,
      }),
    });

    await this.auditAdmin(actor, 'ADMIN_ORDER_STATUS_UPDATED', {
      entityType: 'order',
      entityId: id,
      orderId: id,
      metadata: { status },
    });

    return { success: true, order };
  }

  async listPayments(query: any) {
    const pagination = this.pagination(query);
    const where: any = {};
    const status = this.normalizePaymentStatus(query?.status);

    if (status) {
      where.status = status;
    }

    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          order: {
            include: {
              client: { select: this.userSelect() },
              professional: { select: this.userSelect() },
            },
          },
        },
      }),
    ]);

    return { success: true, total, ...pagination, items };
  }

  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: true,
        audits: { orderBy: { createdAt: 'desc' }, take: 50 },
        webhookEvents: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado');
    }

    return { success: true, payment };
  }

  async updatePaymentStatus(id: string, body: any, actor: AdminActor) {
    const status = this.normalizePaymentStatus(body?.status);

    if (!status) {
      throw new BadRequestException('Status de pagamento invalido');
    }

    const payment = await this.prisma.payment.update({
      where: { id },
      data: this.cleanData({
        status,
        paidAt: ['PAID', 'ESCROW_HELD'].includes(status)
          ? new Date()
          : undefined,
        releasedAt: status === 'RELEASED' ? new Date() : undefined,
        refundedAt: ['REFUNDED', 'PARTIAL_REFUND'].includes(status)
          ? new Date()
          : undefined,
      }),
    });

    await this.auditAdmin(actor, 'ADMIN_PAYMENT_STATUS_UPDATED', {
      entityType: 'payment',
      entityId: id,
      paymentId: id,
      orderId: payment.orderId,
      provider: payment.provider,
      status,
      amount: Number(payment.amount ?? 0),
    });

    return { success: true, payment };
  }

  async paymentAudit(id: string) {
    const audits = await this.prisma.paymentAudit.findMany({
      where: { paymentId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { success: true, paymentId: id, audits };
  }

  async listDisputes(query: any) {
    const pagination = this.pagination(query);
    const where: any = {};
    const status = this.normalizeDisputeStatus(query?.status);
    const scope = this.readString(query?.scope ?? query?.risk);

    if (status) {
      where.status = status;
    } else if (scope !== 'all') {
      where.OR = [
        { adminReviewRequired: true },
        { aiRiskLevel: { in: ['HIGH', 'CRITICAL'] } },
        { status: 'UNDER_REVIEW' },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { serviceOrder: true },
      }),
    ]);

    return { success: true, total, ...pagination, items };
  }

  async getDispute(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { serviceOrder: true },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa nao encontrada');
    }

    return { success: true, dispute };
  }

  async resolveDispute(id: string, body: any, actor: AdminActor) {
    const resolution =
      this.readString(body?.resolution) ?? 'Resolucao administrativa';
    const dispute = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolution,
        resolvedAt: new Date(),
      },
    });

    await this.auditAdmin(actor, 'ADMIN_DISPUTE_RESOLVED', {
      entityType: 'dispute',
      entityId: id,
      orderId: dispute.serviceOrderId,
      metadata: { resolution },
    });

    return { success: true, dispute };
  }

  async recordAction(actor: AdminActor, body: any) {
    const action = this.readString(body?.action) ?? 'ADMIN_ACTION';

    return this.auditAdmin(actor, action, {
      entityType: this.readString(body?.entityType),
      entityId: this.readString(body?.entityId),
      metadata: body,
    });
  }

  async adminActions(take?: any) {
    return {
      success: true,
      actions: await this.auditService.list({
        limit: this.normalizeTake(take, 100),
        actionPrefix: 'ADMIN',
      }),
    };
  }

  async audit(take?: any) {
    return {
      success: true,
      audit: await this.auditService.list({
        limit: this.normalizeTake(take, 100),
      }),
    };
  }

  private buildGrowthDashboard(input: {
    orders: any[];
    totalOrders: number;
    openOrders: number;
    completedOrders: number;
    pendingPayments: number;
    releasedPayments: number;
    platformRevenueTotal: number;
    revenueTotal: number;
    newUsers7d: number;
    fraudRisk: any;
  }) {
    const accepted = input.orders.filter((order) =>
      ['ACCEPTED', 'IN_PROGRESS', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(
        order.status,
      ),
    );
    const cancelled = input.orders.filter((order) =>
      ['CANCELED', 'CANCELLED'].includes(order.status),
    );
    const matching = input.orders.filter((order) => order.status === 'MATCHING');
    const completed = input.orders.filter((order) => order.status === 'COMPLETED');
    const averageResponseMinutes = this.averageResponseMinutes(input.orders);
    const conversionRate =
      input.totalOrders > 0
        ? this.roundCurrency((input.completedOrders / input.totalOrders) * 100)
        : 0;
    const acceptedRate =
      input.orders.length > 0
        ? this.roundCurrency((accepted.length / input.orders.length) * 100)
        : 0;

    return {
      summary: {
        servicesCreated: input.totalOrders,
        servicesCompleted: input.completedOrders,
        openServices: input.openOrders,
        acceptedBudgets: accepted.length,
        rejectedBudgets: cancelled.length,
        sentProposals: Math.max(matching.length * 5, accepted.length + cancelled.length),
        acceptedProposals: accepted.length,
        conversionRate,
        acceptedRate,
        averageResponseMinutes,
        payments: input.revenueTotal,
        commission10Percent: input.platformRevenueTotal,
        newUsers7d: input.newUsers7d,
        retentionProxy: this.retentionProxy(input.orders),
        cancellations: cancelled.length,
        averageRisk: input.fraudRisk,
        systemStatus:
          input.pendingPayments > 0 ? 'Pagamentos em acompanhamento' : 'Operacao estavel',
      },
      demand: {
        topCities: this.topCityDemand(input.orders),
        topNeighborhoods: this.topNeighborhoodDemand(input.orders),
        topCategories: this.topCategoryDemand(input.orders),
        peakHours: this.peakHours(input.orders),
        activeProfessionals: this.activeProfessionals(input.orders),
      },
      funnel: {
        acceptedBudgets: accepted.length,
        rejectedBudgets: cancelled.length,
        sentProposals: Math.max(matching.length * 5, accepted.length + cancelled.length),
        acceptedProposals: accepted.length,
        completedServices: completed.length,
        releasedPayments: input.releasedPayments,
      },
      alerts: [
        averageResponseMinutes > 25
          ? {
              level: 'attention',
              title: 'Tempo medio de resposta alto',
              detail: `${averageResponseMinutes} min em ordens recentes.`,
            }
          : undefined,
        cancelled.length > accepted.length * 0.35
          ? {
              level: 'warning',
              title: 'Cancelamentos acima do esperado',
              detail: `${cancelled.length} cancelamentos nas ordens analisadas.`,
            }
          : undefined,
        input.fraudRisk?.riskLevel === 'alto' || input.fraudRisk?.level === 'alto'
          ? {
              level: 'critical',
              title: 'Risco medio elevado',
              detail: 'Revisar propostas, atrasos e tentativas de contato fora do app.',
            }
          : undefined,
      ].filter(Boolean),
    };
  }

  private async databaseStatus() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        ok: true,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'DATABASE_ERROR',
      };
    }
  }

  private async realtimeEvents(since: Date) {
    const [tracking, timeline, chat, recentTimeline] = await Promise.all([
      this.prisma.trackingEvent.count({
        where: { timestamp: { gte: since } },
      }),
      this.prisma.operationalTimelineEvent.count({
        where: { timestamp: { gte: since } },
      }),
      this.prisma.chatMessage.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.operationalTimelineEvent.findMany({
        where: { timestamp: { gte: since } },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
    ]);

    return {
      total: tracking + timeline + chat,
      tracking,
      timeline,
      chat,
      recent: recentTimeline,
    };
  }

  private groupCounts(rows: any[]) {
    return rows.map((row) => ({
      status: row.status,
      count: Number(row._count?._all ?? 0),
    }));
  }

  private topCategoryDemand(orders: any[]) {
    return this.topCounts(
      orders
        .map((order) => this.readString(order.category))
        .filter(Boolean) as string[],
      8,
    );
  }

  private topNeighborhoodDemand(orders: any[]) {
    return this.topCounts(
      orders
        .map((order) => this.parseAddress(order.address).neighborhood)
        .filter(Boolean) as string[],
      8,
    );
  }

  private topCityDemand(orders: any[]) {
    return this.topCounts(
      orders
        .map((order) => this.parseAddress(order.address).city)
        .filter(Boolean) as string[],
      6,
    );
  }

  private peakHours(orders: any[]) {
    return this.topCounts(
      orders.map((order) => {
        const hour = new Date(order.createdAt).getHours();
        return `${String(hour).padStart(2, '0')}:00`;
      }),
      6,
    );
  }

  private activeProfessionals(orders: any[]) {
    return this.topCounts(
      orders
        .map((order) => this.readString(order.professionalId))
        .filter(Boolean) as string[],
      8,
    ).map((item) => ({
      professionalId: item.label,
      services: item.value,
    }));
  }

  private topCounts(values: string[], take: number) {
    const counts = new Map<string, number>();

    for (const value of values) {
      const key = value.trim();
      if (!key) {
        continue;
      }

      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, take)
      .map(([label, value]) => ({ label, value }));
  }

  private parseAddress(address: any) {
    const text = this.readString(address);

    if (!text) {
      return {
        neighborhood: 'Nao informado',
        city: 'Nao informada',
      };
    }

    const parts = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      neighborhood: parts[0] ?? 'Nao informado',
      city: parts[parts.length - 1] ?? 'Nao informada',
    };
  }

  private averageResponseMinutes(orders: any[]) {
    const samples = orders
      .map((order) => {
        if (!order.acceptedAt || !order.createdAt) {
          return undefined;
        }

        return Math.max(
          1,
          Math.round(
            (new Date(order.acceptedAt).getTime() -
              new Date(order.createdAt).getTime()) /
              60000,
          ),
        );
      })
      .filter((value) => Number.isFinite(value)) as number[];

    if (!samples.length) {
      return 0;
    }

    return Math.round(
      samples.reduce((total, value) => total + value, 0) / samples.length,
    );
  }

  private retentionProxy(orders: any[]) {
    const clients = new Map<string, number>();

    for (const order of orders) {
      const clientId = this.readString(order.clientId);
      if (!clientId) {
        continue;
      }

      clients.set(clientId, (clients.get(clientId) ?? 0) + 1);
    }

    const recurring = Array.from(clients.values()).filter((count) => count > 1)
      .length;

    return clients.size > 0
      ? this.roundCurrency((recurring / clients.size) * 100)
      : 0;
  }

  private paymentGroups(rows: any[]) {
    return rows.map((row) => ({
      status: row.status,
      count: Number(row._count?._all ?? 0),
      revenue: this.toNumber(row._sum?.amount),
      platformRevenue: this.toNumber(row._sum?.commission),
    }));
  }

  private dashboardAlerts(input: {
    env: ReturnType<typeof getPublicEnvReadiness>;
    pendingPayments: number;
    pendingPixWithdrawals: number;
    openDisputes: number;
    webhookFailures24h: number;
    failedPayments24h: number;
    recentErrorsCount: number;
  }) {
    return [
      !input.env.productionReady
        ? {
            level: 'warning',
            title: 'Ambiente de producao incompleto',
            detail: `${input.env.configuredCount}/${input.env.requiredCount} variaveis obrigatorias configuradas.`,
          }
        : undefined,
      input.pendingPayments > 0
        ? {
            level: 'attention',
            title: 'Pagamentos aguardando confirmacao',
            detail: `${input.pendingPayments} pagamentos pendentes ou autorizados.`,
          }
        : undefined,
      input.pendingPixWithdrawals > 0
        ? {
            level: 'attention',
            title: 'Saques PIX pendentes',
            detail: `${input.pendingPixWithdrawals} solicitacoes aguardando processamento.`,
          }
        : undefined,
      input.openDisputes > 0
        ? {
            level: 'critical',
            title: 'Disputas abertas',
            detail: `${input.openDisputes} atendimentos precisam de avaliacao operacional.`,
          }
        : undefined,
      input.webhookFailures24h > 0 || input.failedPayments24h > 0
        ? {
            level: 'critical',
            title: 'Falhas financeiras nas ultimas 24h',
            detail: `${input.failedPayments24h} pagamentos e ${input.webhookFailures24h} webhooks com falha.`,
          }
        : undefined,
      input.recentErrorsCount > 0
        ? {
            level: 'warning',
            title: 'Erros recentes observados',
            detail: `${input.recentErrorsCount} registros recentes precisam de revisao.`,
          }
        : undefined,
    ].filter(Boolean);
  }

  private async countPendingPixWithdrawals() {
    const withdrawals = await this.prisma.walletTransaction.findMany({
      where: { type: 'PIX_WITHDRAWAL' },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });

    return withdrawals.filter((transaction) => {
      const metadata = this.readObject(transaction.metadata);

      return (
        transaction.status === 'PENDING' ||
        metadata.providerStatus === 'READY_FOR_PROCESSING'
      );
    }).length;
  }

  private async auditAdmin(
    actor: AdminActor,
    action: string,
    payload: Record<string, any>,
  ) {
    return this.auditService.register(action, {
      ...payload,
      domain: 'admin',
      actorId: this.actorId(actor),
      actorEmail: actor?.email,
      actorRole: actor?.role,
    });
  }

  private userSelect() {
    return {
      id: true,
      email: true,
      name: true,
      role: true,
      fcmToken: true,
      createdAt: true,
    };
  }

  private pagination(query: any) {
    const take = this.normalizeTake(query?.take ?? query?.limit, 50);
    const page = Math.max(Number(query?.page ?? 1), 1);

    return {
      take,
      page,
      skip: (page - 1) * take,
    };
  }

  private normalizeTake(value: any, fallback: number) {
    const take = Number(value ?? fallback);
    return Number.isFinite(take) ? Math.min(Math.max(take, 1), 200) : fallback;
  }

  private normalizeRole(value: any) {
    const role = this.readString(value)?.toUpperCase();
    const allowed = ['CLIENT', 'PROFESSIONAL', 'ADMIN'];

    return allowed.includes(role ?? '') ? role : undefined;
  }

  private normalizeOrderStatus(value: any) {
    const status = this.readString(value)?.toUpperCase();
    const normalized = status === 'CANCELED' ? 'CANCELLED' : status;
    const allowed = [
      'CREATED',
      'MATCHING',
      'ACCEPTED',
      'IN_PROGRESS',
      'CHECKED_IN',
      'CHECKED_OUT',
      'COMPLETED',
      'CANCELED',
      'CANCELLED',
      'DISPUTED',
    ];

    return allowed.includes(normalized ?? '') ? normalized : undefined;
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

  private normalizeDisputeStatus(value: any) {
    const status = this.readString(value)?.toUpperCase();
    const allowed = ['OPEN', 'CLIENT', 'PROFESSIONAL', 'RESOLVED'];

    return allowed.includes(status ?? '') ? status : undefined;
  }

  private orderTimestampField(status: string) {
    const fields: Record<string, string> = {
      ACCEPTED: 'acceptedAt',
      IN_PROGRESS: 'startedAt',
      CHECKED_IN: 'checkInAt',
      CHECKED_OUT: 'checkOutAt',
      COMPLETED: 'completedAt',
      CANCELED: 'cancelledAt',
      CANCELLED: 'cancelledAt',
    };

    return fields[status];
  }

  private cleanData(data: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
  }

  private actorId(actor: AdminActor) {
    return this.readString(actor?.userId ?? actor?.id);
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

  private toNumber(value: any) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }
}
