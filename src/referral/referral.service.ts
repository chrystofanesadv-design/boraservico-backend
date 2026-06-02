import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { FraudService } from '../fraud/fraud.service';
import { AuditService } from '../security/audit.service';

const PHASE_1_PERCENT = 0.05;
const PHASE_1_LIMIT = 300;
const PHASE_2_PERCENT = 0.025;
const PHASE_2_LIMIT = 200;
const TOTAL_LIMIT = 500;

@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly fraudService: FraudService,
    private readonly auditService: AuditService,
  ) {}

  async getMe(userId?: string) {
    const normalizedUserId = this.requireUserId(userId);
    await this.requireUser(this.prisma, normalizedUserId);

    const now = new Date();
    const referralsMade = await this.refreshReferralList(
      await this.prisma.referral.findMany({
        where: { referrerId: normalizedUserId },
        orderBy: { createdAt: 'desc' },
      }),
      now,
    );
    const referralsReceived = await this.refreshReferralList(
      await this.prisma.referral.findMany({
        where: { referredUserId: normalizedUserId },
        orderBy: { createdAt: 'desc' },
      }),
      now,
    );
    const history = await this.getReferralHistory(normalizedUserId, 50);
    const wallet = await this.walletService.getWallet(normalizedUserId, 10);
    const activeReferrals = referralsMade.filter((referral) =>
      ['PHASE_1', 'PHASE_2'].includes(referral.status),
    );

    return {
      success: true,
      userId: normalizedUserId,
      ...this.buildShareContract(normalizedUserId),
      wallet: this.publicWalletSummary(wallet),
      currentPhase: activeReferrals[0]
        ? this.getCurrentPhase(activeReferrals[0])
        : this.getDefaultCurrentPhase(now),
      phases: this.getReferralPhases(),
      limitRemaining: this.roundCurrency(
        referralsMade.reduce(
          (total, referral) =>
            total + this.getRemainingLimits(referral).totalRemaining,
          0,
        ),
      ),
      referralsMade: referralsMade.map((referral) =>
        this.toPublicReferral(referral),
      ),
      referralsReceived: referralsReceived.map((referral) =>
        this.toPublicReferral(referral),
      ),
      history,
    };
  }

  async createReferral(data: any) {
    const referrerId = this.readString(data?.referrerId ?? data?.userId);
    const referredUserId = this.readString(data?.referredUserId);

    if (referrerId && referredUserId) {
      return this.createReferralRelation(referrerId, referredUserId);
    }

    return this.createShareContract(referrerId);
  }

  async createShareContract(userId?: string) {
    const normalizedUserId = this.requireUserId(userId);
    const user = await this.requireUser(this.prisma, normalizedUserId);

    return {
      success: true,
      userId: normalizedUserId,
      userName: user.name,
      ...this.buildShareContract(normalizedUserId),
    };
  }

  async applyReferral(data: any) {
    const referredUserId = this.requireUserId(
      data?.referredUserId ?? data?.userId,
    );
    const referrerId =
      this.readString(data?.referrerId) ??
      this.decodeReferralCode(data?.referralCode ?? data?.code);

    if (!referrerId) {
      throw new BadRequestException('referralCode ou referrerId obrigatorio');
    }

    return this.createReferralRelation(referrerId, referredUserId);
  }

  async calculateBonus(data: any) {
    const referredUserId = this.requireUserId(data?.referredUserId);
    const serviceValue = this.requireAmount(data?.serviceValue ?? data?.amount);
    const sourceEventId = this.readString(
      data?.orderId ?? data?.idempotencyKey ?? data?.eventId,
    );

    if (!sourceEventId) {
      throw new BadRequestException(
        'orderId ou idempotencyKey obrigatorio para impedir bonus duplicado',
      );
    }

    return this.prisma.$transaction(async (tx: any) => {
      const activeReferral = await tx.referral.findFirst({
        where: {
          referredUserId,
          status: { in: ['PHASE_1', 'PHASE_2'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeReferral) {
        return {
          success: false,
          error: 'ACTIVE_REFERRAL_NOT_FOUND',
          message: 'Nenhuma indicacao ativa encontrada',
        };
      }

      const now = new Date();
      const referral = await this.refreshReferralPhase(tx, activeReferral, now);

      if (referral.status === 'COMPLETED') {
        return {
          success: false,
          error: 'REFERRAL_COMPLETED',
          message: 'Programa de indicacao encerrado para este vinculo',
          referral: this.toPublicReferral(referral),
        };
      }

      const duplicateBonus = await tx.referralBonus.findFirst({
        where: {
          referralId: referral.id,
          OR: [{ idempotencyKey: sourceEventId }, { orderId: sourceEventId }],
        },
        include: { walletTransaction: true },
      });

      if (duplicateBonus) {
        const fraudRisk = await this.scoreReferral({
          type: 'referral',
          referralId: referral.id,
          referrerId: referral.referrerId,
          referredUserId: referral.referredUserId,
          orderId: sourceEventId,
          idempotencyKey: sourceEventId,
          duplicateBonus: true,
        });

        await this.auditService.register('REFERRAL_DUPLICATE_BONUS_BLOCKED', {
          userId: referral.referrerId,
          action: 'REFERRAL_DUPLICATE_BONUS_BLOCKED',
          details: {
            referralId: referral.id,
            fraudRisk: this.publicFraudRisk(fraudRisk),
          },
        });

        return {
          success: true,
          duplicate: true,
          message: 'Bonus ja registrado para este evento',
          bonus: this.toPublicBonus(duplicateBonus),
          referral: this.toPublicReferral(referral),
          fraudRisk: this.publicFraudRisk(fraudRisk),
          walletTransaction: duplicateBonus.walletTransaction
            ? this.toPublicWalletTransaction(duplicateBonus.walletTransaction)
            : undefined,
        };
      }

      const phase = referral.status === 'PHASE_1' ? 1 : 2;
      const percentage =
        phase === 1
          ? Number(referral.phase1Percent ?? PHASE_1_PERCENT)
          : Number(referral.phase2Percent ?? PHASE_2_PERCENT);
      const limits = this.getRemainingLimits(referral);
      const phaseRemaining =
        phase === 1 ? limits.phase1Remaining : limits.phase2Remaining;
      const rawBonus = this.roundCurrency(serviceValue * percentage);
      const bonusAmount = this.roundCurrency(
        Math.min(rawBonus, phaseRemaining, limits.totalRemaining),
      );

      if (bonusAmount <= 0) {
        const completed = await this.advanceOrCompleteReferral(
          tx,
          referral,
          now,
        );

        return {
          success: false,
          error: 'BONUS_LIMIT_REACHED',
          message: 'Limite de bonus atingido',
          referral: this.toPublicReferral(completed),
        };
      }

      const bonus = await tx.referralBonus.create({
        data: {
          referralId: referral.id,
          referrerId: referral.referrerId,
          referredUserId: referral.referredUserId,
          orderId: sourceEventId,
          idempotencyKey: sourceEventId,
          serviceValue,
          phase,
          percentage,
          bonusAmount,
          withdrawable: true,
        },
      });
      const walletTransaction = await this.creditReferralWallet(tx, {
        referral,
        bonusId: bonus.id,
        bonusAmount,
        serviceValue,
        sourceEventId,
        phase,
        percentage,
      });
      const persistedBonus = await tx.referralBonus.update({
        where: { id: bonus.id },
        data: { walletTransactionId: walletTransaction.id },
        include: { walletTransaction: true },
      });
      const updateData =
        phase === 1
          ? {
              phase1Earned: { increment: bonusAmount },
              totalEarned: { increment: bonusAmount },
            }
          : {
              phase2Earned: { increment: bonusAmount },
              totalEarned: { increment: bonusAmount },
            };
      const updatedReferral = await tx.referral.update({
        where: { id: referral.id },
        data: updateData,
      });
      const finalReferral = await this.advanceOrCompleteReferral(
        tx,
        updatedReferral,
        now,
      );

      await this.auditService.register('REFERRAL_BONUS_CREDITED', {
        userId: referral.referrerId,
        action: 'REFERRAL_BONUS_CREDITED',
        details: {
          referralId: referral.id,
          referredUserId: referral.referredUserId,
          idempotencyKey: sourceEventId,
          phase,
          percentage,
          bonusAmount,
        },
      });

      return {
        success: true,
        message: 'Bonus calculado e creditado automaticamente na wallet',
        phase,
        percentage,
        bonusAmount,
        limitRemaining: this.getRemainingLimits(finalReferral),
        bonus: this.toPublicBonus(persistedBonus),
        referral: this.toPublicReferral(finalReferral),
        walletCredit: {
          userId: referral.referrerId,
          amount: bonusAmount,
          withdrawable: true,
          pixWithdrawImmediate: true,
        },
        walletTransaction: this.toPublicWalletTransaction(walletTransaction),
      };
    });
  }

  async getHistory(userId?: string, take = 100) {
    const normalizedUserId = this.requireUserId(userId);
    await this.requireUser(this.prisma, normalizedUserId);

    const history = await this.getReferralHistory(normalizedUserId, take);

    return {
      success: true,
      userId: normalizedUserId,
      history,
    };
  }

  async listReferrals() {
    const referrals = await this.refreshReferralList(
      await this.prisma.referral.findMany({
        orderBy: { createdAt: 'desc' },
      }),
      new Date(),
    );

    return referrals.map((referral) => this.toPublicReferral(referral));
  }

  async listBonuses() {
    const bonuses = await this.prisma.referralBonus.findMany({
      orderBy: { createdAt: 'desc' },
      include: { walletTransaction: true },
    });

    return bonuses.map((bonus) => this.toPublicBonus(bonus));
  }

  private async findPersistedOrderId(tx: any, orderId?: string) {
    if (!orderId) {
      return undefined;
    }

    const order = await tx.serviceOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    return order?.id;
  }

  private async requireUser(tx: any, userId: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });

    if (!user) {
      throw new BadRequestException('Usuario nao encontrado');
    }

    return user;
  }

  private buildShareContract(userId: string) {
    const referralCode = this.encodeReferralCode(userId);
    const referralLink = `${this.getReferralBaseUrl()}/referral?code=${encodeURIComponent(
      referralCode,
    )}`;
    const whatsappMessage =
      `Indique e ganhe até R$500 em recompensas no BoraServico. ` +
      `Use meu codigo ${referralCode} ` +
      `para entrar: ${referralLink}`;

    return {
      referralCode,
      referralLink,
      headline: 'Indique e ganhe até R$500 em recompensas',
      whatsappMessage,
      shareText: whatsappMessage,
    };
  }

  private encodeReferralCode(userId: string) {
    return `BORA-${Buffer.from(userId, 'utf8').toString('base64url')}`;
  }

  private decodeReferralCode(value: any) {
    const code = this.readString(value);

    if (!code) {
      return undefined;
    }

    if (!code.toUpperCase().startsWith('BORA-')) {
      return code;
    }

    try {
      return Buffer.from(code.slice(5), 'base64url').toString('utf8');
    } catch {
      return undefined;
    }
  }

  private getReferralBaseUrl() {
    return (
      this.readString(process.env.REFERRAL_BASE_URL) ??
      this.readString(process.env.APP_PUBLIC_URL) ??
      this.readString(process.env.PUBLIC_APP_URL) ??
      this.readString(process.env.API_BASE_URL) ??
      'https://boraservico.app'
    ).replace(/\/$/, '');
  }

  private toPublicReferral(referral: any) {
    const limits = this.getRemainingLimits(referral);

    return {
      id: referral.id,
      referrerId: referral.referrerId,
      referredUserId: referral.referredUserId,
      status: referral.status,
      currentPhase: this.getCurrentPhase(referral),
      phase1StartAt: this.toIso(referral.phase1StartAt),
      phase1EndAt: this.toIso(referral.phase1EndAt),
      phase1Percent: Number(referral.phase1Percent ?? PHASE_1_PERCENT),
      phase1Limit: Number(referral.phase1Limit ?? PHASE_1_LIMIT),
      phase1Earned: Number(referral.phase1Earned ?? 0),
      phase2StartAt: this.toIso(referral.phase2StartAt),
      phase2EndAt: this.toIso(referral.phase2EndAt),
      phase2Percent: Number(referral.phase2Percent ?? PHASE_2_PERCENT),
      phase2Limit: Number(referral.phase2Limit ?? PHASE_2_LIMIT),
      phase2Earned: Number(referral.phase2Earned ?? 0),
      totalLimit: Number(referral.totalLimit ?? TOTAL_LIMIT),
      totalEarned: Number(referral.totalEarned ?? 0),
      limitRemaining: limits,
      completedAt: this.toIso(referral.completedAt),
      createdAt: this.toIso(referral.createdAt),
      updatedAt: this.toIso(referral.updatedAt),
    };
  }

  private toPublicBonus(bonus: any) {
    return {
      id: bonus.id,
      referralId: bonus.referralId,
      referrerId: bonus.referrerId,
      referredUserId: bonus.referredUserId,
      orderId: bonus.orderId,
      idempotencyKey: bonus.idempotencyKey,
      serviceValue: Number(bonus.serviceValue ?? 0),
      phase: bonus.phase,
      percentage: Number(bonus.percentage ?? 0),
      bonusAmount: Number(bonus.bonusAmount ?? 0),
      withdrawable: Boolean(bonus.withdrawable),
      walletTransactionId: bonus.walletTransactionId,
      walletTransaction: bonus.walletTransaction
        ? this.toPublicWalletTransaction(bonus.walletTransaction)
        : undefined,
      createdAt: this.toIso(bonus.createdAt),
    };
  }

  private toPublicWalletTransaction(transaction: any) {
    return {
      id: transaction.id,
      userId: transaction.userId,
      orderId: transaction.orderId,
      type: transaction.type,
      amount: Number(transaction.amount ?? 0),
      status: transaction.status,
      source: transaction.source,
      metadata: this.parseMetadata(transaction.metadata),
      timestamp: this.toIso(transaction.timestamp),
      createdAt: this.toIso(transaction.timestamp),
    };
  }

  private publicWalletSummary(wallet: any) {
    return {
      availableBalance: Number(wallet.availableBalance ?? 0),
      escrowBalance: Number(wallet.escrowBalance ?? wallet.escrow ?? 0),
      totalBalance: Number(wallet.totalBalance ?? wallet.balance ?? 0),
    };
  }

  private getCurrentPhase(referral: any) {
    if (referral.status === 'PHASE_1') {
      return {
        phase: 1,
        status: referral.status,
        percent: Number(referral.phase1Percent ?? PHASE_1_PERCENT),
        limit: Number(referral.phase1Limit ?? PHASE_1_LIMIT),
        earned: Number(referral.phase1Earned ?? 0),
        remaining: this.getRemainingLimits(referral).phase1Remaining,
        startsAt: this.toIso(referral.phase1StartAt),
        endsAt: this.toIso(referral.phase1EndAt),
      };
    }

    if (referral.status === 'PHASE_2') {
      return {
        phase: 2,
        status: referral.status,
        percent: Number(referral.phase2Percent ?? PHASE_2_PERCENT),
        limit: Number(referral.phase2Limit ?? PHASE_2_LIMIT),
        earned: Number(referral.phase2Earned ?? 0),
        remaining: this.getRemainingLimits(referral).phase2Remaining,
        startsAt: this.toIso(referral.phase2StartAt),
        endsAt: this.toIso(referral.phase2EndAt),
      };
    }

    return {
      phase: null,
      status: referral.status,
      percent: 0,
      limit: 0,
      earned: Number(referral.totalEarned ?? 0),
      remaining: 0,
      startsAt: undefined,
      endsAt: this.toIso(referral.completedAt),
    };
  }

  private getDefaultCurrentPhase(now = new Date()) {
    return {
      phase: 1,
      status: 'AVAILABLE',
      percent: PHASE_1_PERCENT,
      limit: PHASE_1_LIMIT,
      earned: 0,
      remaining: PHASE_1_LIMIT,
      totalLimit: TOTAL_LIMIT,
      totalRemaining: TOTAL_LIMIT,
      startsAt: this.toIso(now),
      endsAt: this.toIso(this.addMonths(now, 3)),
      nextPhase: {
        phase: 2,
        percent: PHASE_2_PERCENT,
        limit: PHASE_2_LIMIT,
        remaining: PHASE_2_LIMIT,
      },
    };
  }

  private getReferralPhases() {
    return [
      {
        phase: 1,
        percent: PHASE_1_PERCENT,
        limit: PHASE_1_LIMIT,
        durationMonths: 3,
      },
      {
        phase: 2,
        percent: PHASE_2_PERCENT,
        limit: PHASE_2_LIMIT,
        durationMonths: 3,
      },
    ];
  }

  private getRemainingLimits(referral: any) {
    if (['COMPLETED', 'CANCELLED'].includes(referral.status)) {
      return {
        phase1Remaining: 0,
        phase2Remaining: 0,
        totalRemaining: 0,
      };
    }

    const phase1Remaining = Math.max(
      0,
      Number(referral.phase1Limit ?? PHASE_1_LIMIT) -
        Number(referral.phase1Earned ?? 0),
    );
    const phase2Remaining = Math.max(
      0,
      Number(referral.phase2Limit ?? PHASE_2_LIMIT) -
        Number(referral.phase2Earned ?? 0),
    );
    const totalRemaining = Math.max(
      0,
      Number(referral.totalLimit ?? TOTAL_LIMIT) -
        Number(referral.totalEarned ?? 0),
    );

    return {
      phase1Remaining: this.roundCurrency(phase1Remaining),
      phase2Remaining: this.roundCurrency(phase2Remaining),
      totalRemaining: this.roundCurrency(totalRemaining),
    };
  }

  private async scoreReferral(data: any) {
    try {
      return await this.fraudService.analyzeReferral(data, {
        userId: data?.referrerId,
      });
    } catch {
      return undefined;
    }
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

  private requireUserId(value: any) {
    const userId = this.readString(value);

    if (!userId) {
      throw new BadRequestException('userId obrigatorio');
    }

    return userId;
  }

  private requireAmount(value: any) {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Valor deve ser maior que zero');
    }

    return this.roundCurrency(amount);
  }

  private parseMetadata(value: any): Record<string, any> {
    if (!value) {
      return {};
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }

    return {};
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private toIso(value: any) {
    return value?.toISOString?.() ?? value ?? undefined;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private addMonths(date: Date, months: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  async findReferral(id: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
    });

    if (!referral) {
      return null;
    }

    const refreshed = await this.refreshReferralPhase(
      this.prisma,
      referral,
      new Date(),
    );

    return this.toPublicReferral(refreshed);
  }

  private async createReferralRelation(
    referrerId: string,
    referredUserId: string,
  ) {
    const fraudRisk = await this.scoreReferral({
      type: 'referral',
      referrerId,
      referredUserId,
    });

    if (referrerId === referredUserId) {
      throw new BadRequestException('Autoindicacao nao permitida');
    }

    await this.requireUser(this.prisma, referrerId);
    await this.requireUser(this.prisma, referredUserId);

    const activeForReferred = await this.prisma.referral.findFirst({
      where: {
        referredUserId,
        status: { in: ['PHASE_1', 'PHASE_2'] },
      },
    });

    if (activeForReferred && activeForReferred.referrerId !== referrerId) {
      throw new BadRequestException('Usuario ja possui indicacao ativa');
    }

    const now = new Date();
    const referral = await this.prisma.referral.upsert({
      where: {
        referrerId_referredUserId: {
          referrerId,
          referredUserId,
        },
      },
      update: {},
      create: {
        referrerId,
        referredUserId,
        status: 'PHASE_1',
        phase1StartAt: now,
        phase1EndAt: this.addMonths(now, 3),
        phase1Percent: PHASE_1_PERCENT,
        phase1Limit: PHASE_1_LIMIT,
        phase2Percent: PHASE_2_PERCENT,
        phase2Limit: PHASE_2_LIMIT,
        totalLimit: TOTAL_LIMIT,
      },
    });
    const refreshed = await this.refreshReferralPhase(
      this.prisma,
      referral,
      now,
    );

    await this.auditService.register('REFERRAL_APPLIED', {
      userId: referrerId,
      action: 'REFERRAL_APPLIED',
      details: {
        referralId: referral.id,
        referrerId,
        referredUserId,
        fraudRisk: this.publicFraudRisk(fraudRisk),
      },
    });

    return {
      success: true,
      message: 'Indicacao aplicada',
      referral: this.toPublicReferral(refreshed),
      fraudRisk: this.publicFraudRisk(fraudRisk),
      ...this.buildShareContract(referrerId),
    };
  }

  private async refreshReferralList(
    referrals: any[],
    now: Date,
  ): Promise<any[]> {
    const refreshed: any[] = [];

    for (const referral of referrals) {
      refreshed.push(
        await this.refreshReferralPhase(this.prisma, referral, now),
      );
    }

    return refreshed;
  }

  private async refreshReferralPhase(tx: any, referral: any, now: Date) {
    let current = referral;

    if (
      current.status === 'PHASE_1' &&
      (now >= current.phase1EndAt ||
        Number(current.phase1Earned) >= Number(current.phase1Limit))
    ) {
      const phase2StartAt =
        now >= current.phase1EndAt ? current.phase1EndAt : now;

      current = await tx.referral.update({
        where: { id: current.id },
        data: {
          status: 'PHASE_2',
          phase2StartAt,
          phase2EndAt: this.addMonths(phase2StartAt, 3),
        },
      });
    }

    if (
      current.status === 'PHASE_2' &&
      ((current.phase2EndAt && now >= current.phase2EndAt) ||
        Number(current.phase2Earned) >= Number(current.phase2Limit) ||
        Number(current.totalEarned) >= Number(current.totalLimit))
    ) {
      current = await tx.referral.update({
        where: { id: current.id },
        data: {
          status: 'COMPLETED',
          completedAt: current.completedAt ?? now,
        },
      });
    }

    return current;
  }

  private async advanceOrCompleteReferral(tx: any, referral: any, now: Date) {
    if (
      referral.status === 'PHASE_1' &&
      (Number(referral.phase1Earned) >= Number(referral.phase1Limit) ||
        Number(referral.totalEarned) >= Number(referral.totalLimit))
    ) {
      return tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'PHASE_2',
          phase2StartAt: now,
          phase2EndAt: this.addMonths(now, 3),
        },
      });
    }

    if (
      referral.status === 'PHASE_2' &&
      (Number(referral.phase2Earned) >= Number(referral.phase2Limit) ||
        Number(referral.totalEarned) >= Number(referral.totalLimit))
    ) {
      return tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'COMPLETED',
          completedAt: referral.completedAt ?? now,
        },
      });
    }

    return referral;
  }

  private async creditReferralWallet(tx: any, data: any) {
    const wallet = await tx.wallet.upsert({
      where: { userId: data.referral.referrerId },
      update: {},
      create: {
        userId: data.referral.referrerId,
        balance: 0,
        availableBalance: 0,
        escrowBalance: 0,
      },
    });
    const availableBalance = this.roundCurrency(
      Number(wallet.availableBalance ?? 0) + data.bonusAmount,
    );
    const escrowBalance = this.roundCurrency(Number(wallet.escrowBalance ?? 0));
    const updatedWallet = await tx.wallet.update({
      where: { userId: data.referral.referrerId },
      data: {
        availableBalance,
        escrowBalance,
        balance: this.roundCurrency(availableBalance + escrowBalance),
      },
    });
    const orderId = await this.findPersistedOrderId(tx, data.sourceEventId);

    return tx.walletTransaction.create({
      data: {
        userId: data.referral.referrerId,
        orderId,
        type: 'REFERRAL_BONUS',
        amount: data.bonusAmount,
        status: 'COMPLETED',
        source: 'REFERRAL',
        metadata: JSON.stringify({
          referralId: data.referral.id,
          referralBonusId: data.bonusId,
          referredUserId: data.referral.referredUserId,
          sourceEventId: data.sourceEventId,
          phase: data.phase,
          percentage: data.percentage,
          serviceValue: data.serviceValue,
          withdrawable: true,
          pixWithdrawImmediate: true,
          availableBalanceAfter: Number(updatedWallet.availableBalance ?? 0),
          escrowBalanceAfter: Number(updatedWallet.escrowBalance ?? 0),
          totalBalanceAfter: Number(updatedWallet.balance ?? 0),
        }),
      },
    });
  }

  private async getReferralHistory(userId: string, take: number) {
    const bonuses = await this.prisma.referralBonus.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
      include: { walletTransaction: true },
    });

    return bonuses.map((bonus) => this.toPublicBonus(bonus));
  }
}
