import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type ReferralStatus = 'PHASE_1' | 'PHASE_2' | 'COMPLETED';

interface ReferralMock {
  id: string;
  referrerId: string;
  referredUserId: string;
  status: ReferralStatus;
  phase1StartAt: Date;
  phase1EndAt: Date;
  phase2StartAt?: Date;
  phase2EndAt?: Date;
  phase1Earned: number;
  phase2Earned: number;
  totalEarned: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ReferralBonusMock {
  id: string;
  referralId: string;
  referrerId: string;
  referredUserId: string;
  serviceValue: number;
  phase: 1 | 2;
  percentage: number;
  bonusAmount: number;
  withdrawable: boolean;
  createdAt: Date;
}

@Injectable()
export class ReferralService {
  private referrals: ReferralMock[] = [];
  private bonuses: ReferralBonusMock[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async createReferral(data: any) {
    const persisted = await this.tryCreatePersistedReferral(data);

    if (persisted) {
      return persisted;
    }

    return this.createFallbackReferral(data);
  }

  async listReferrals() {
    try {
      const referrals = await this.prisma.referral.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return referrals.map((referral) => this.toPublicReferral(referral));
    } catch {
      return this.referrals;
    }
  }

  async listBonuses() {
    try {
      const bonuses = await this.prisma.referralBonus.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return bonuses.map((bonus) => this.toPublicBonus(bonus));
    } catch {
      return this.bonuses;
    }
  }

  async findReferral(id: string) {
    try {
      const referral = await this.prisma.referral.findUnique({
        where: { id },
      });

      return referral ? this.toPublicReferral(referral) : null;
    } catch {
      return this.referrals.find((item) => item.id === id) ?? null;
    }
  }

  async calculateBonus(data: any) {
    const persisted = await this.tryCalculatePersistedBonus(data);

    if (persisted) {
      return persisted;
    }

    return this.calculateFallbackBonus(data);
  }

  private async tryCreatePersistedReferral(data: any) {
    const referrerId = this.readString(data?.referrerId);
    const referredUserId = this.readString(data?.referredUserId);

    if (!referrerId || !referredUserId) {
      return null;
    }

    const now = new Date();

    try {
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
        },
      });

      return this.toPublicReferral(referral);
    } catch {
      return null;
    }
  }

  private async tryCalculatePersistedBonus(data: any) {
    const referredUserId = this.readString(data?.referredUserId);

    if (!referredUserId) {
      return null;
    }

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const activeReferral = await tx.referral.findFirst({
          where: {
            referredUserId,
            status: { in: ['PHASE_1', 'PHASE_2'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!activeReferral) {
          return {
            error: 'ACTIVE_REFERRAL_NOT_FOUND',
            message: 'Nenhuma indicacao ativa encontrada',
          };
        }

        const now = new Date();
        const referral = await this.refreshPersistedReferral(
          tx,
          activeReferral,
          now,
        );

        if (referral.status === 'COMPLETED') {
          return {
            error: 'REFERRAL_COMPLETED',
            message: 'Programa de indicacao encerrado para este indicador',
            referral: this.toPublicReferral(referral),
          };
        }

        const serviceValue = this.roundCurrency(Number(data?.serviceValue ?? 0));
        const phase = referral.status === 'PHASE_1' ? 1 : 2;
        const percentage =
          phase === 1
            ? Number(referral.phase1Percent)
            : Number(referral.phase2Percent);
        const phaseEarned =
          phase === 1
            ? Number(referral.phase1Earned)
            : Number(referral.phase2Earned);
        const phaseLimit =
          phase === 1
            ? Number(referral.phase1Limit)
            : Number(referral.phase2Limit);
        const phaseLimitRemaining = Math.max(0, phaseLimit - phaseEarned);
        const totalLimitRemaining = Math.max(
          0,
          Number(referral.totalLimit) - Number(referral.totalEarned),
        );
        const rawBonus = this.roundCurrency(serviceValue * percentage);
        const bonusAmount = this.roundCurrency(
          Math.min(rawBonus, phaseLimitRemaining, totalLimitRemaining),
        );

        if (bonusAmount <= 0) {
          const completed = await this.advanceOrCompletePersistedReferral(
            tx,
            referral,
            now,
          );

          return {
            error: 'BONUS_LIMIT_REACHED',
            message: 'Limite de bonus atingido',
            referral: this.toPublicReferral(completed),
          };
        }

        await tx.wallet.upsert({
          where: { userId: referral.referrerId },
          update: {
            balance: { increment: bonusAmount },
            availableBalance: { increment: bonusAmount },
          },
          create: {
            userId: referral.referrerId,
            balance: bonusAmount,
            availableBalance: bonusAmount,
            escrowBalance: 0,
          },
        });

        const orderId = await this.findPersistedOrderId(
          tx,
          this.readString(data?.orderId),
        );

        const walletTransaction = await tx.walletTransaction.create({
          data: {
            userId: referral.referrerId,
            orderId,
            type: 'REFERRAL_BONUS',
            amount: bonusAmount,
            status: 'COMPLETED',
            source: 'REFERRAL',
            metadata: {
              referralId: referral.id,
              phase,
              percentage,
              withdrawable: true,
              pixWithdrawImmediate: true,
            },
          },
        });

        const bonus = await tx.referralBonus.create({
          data: {
            referralId: referral.id,
            referrerId: referral.referrerId,
            referredUserId: referral.referredUserId,
            orderId: this.readString(data?.orderId),
            serviceValue,
            phase,
            percentage,
            bonusAmount,
            withdrawable: true,
            walletTransactionId: walletTransaction.id,
          },
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

        const finalReferral = await this.advanceOrCompletePersistedReferral(
          tx,
          updatedReferral,
          now,
        );

        return {
          message: 'Bonus calculado e creditado automaticamente na wallet real',
          bonus: this.toPublicBonus(bonus),
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
    } catch {
      return null;
    }
  }

  private createFallbackReferral(data: any) {
    const now = new Date();

    const referral: ReferralMock = {
      id: crypto.randomUUID(),
      referrerId: data?.referrerId,
      referredUserId: data?.referredUserId,
      status: 'PHASE_1',
      phase1StartAt: now,
      phase1EndAt: this.addMonths(now, 3),
      phase1Earned: 0,
      phase2Earned: 0,
      totalEarned: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.referrals.push(referral);

    return referral;
  }

  private calculateFallbackBonus(data: any) {
    const referral = this.referrals.find(
      (item) =>
        item.referredUserId === data?.referredUserId &&
        item.status !== 'COMPLETED',
    );

    if (!referral) {
      return {
        error: 'ACTIVE_REFERRAL_NOT_FOUND',
        message: 'Nenhuma indicacao ativa encontrada',
      };
    }

    const now = new Date();
    const serviceValue = Number(data?.serviceValue ?? 0);

    this.refreshReferralPhase(referral, now);

    if (referral.status === 'COMPLETED') {
      return {
        error: 'REFERRAL_COMPLETED',
        message: 'Programa de indicacao encerrado para este indicador',
        referral,
      };
    }

    const phase = referral.status === 'PHASE_1' ? 1 : 2;
    const percentage = phase === 1 ? 0.05 : 0.025;
    const phaseLimitRemaining =
      phase === 1
        ? Math.max(0, 300 - referral.phase1Earned)
        : Math.max(0, 200 - referral.phase2Earned);

    const totalLimitRemaining = Math.max(0, 500 - referral.totalEarned);
    const rawBonus = serviceValue * percentage;
    const bonusAmount = this.roundCurrency(
      Math.min(rawBonus, phaseLimitRemaining, totalLimitRemaining),
    );

    if (bonusAmount <= 0) {
      this.advanceOrComplete(referral, now);

      return {
        error: 'BONUS_LIMIT_REACHED',
        message: 'Limite de bonus atingido',
        referral,
      };
    }

    if (phase === 1) {
      referral.phase1Earned += bonusAmount;
    } else {
      referral.phase2Earned += bonusAmount;
    }

    referral.totalEarned += bonusAmount;
    referral.updatedAt = now;

    const bonus: ReferralBonusMock = {
      id: crypto.randomUUID(),
      referralId: referral.id,
      referrerId: referral.referrerId,
      referredUserId: referral.referredUserId,
      serviceValue,
      phase,
      percentage,
      bonusAmount,
      withdrawable: true,
      createdAt: now,
    };

    this.bonuses.push(bonus);
    this.advanceOrComplete(referral, now);

    return {
      message: 'Bonus calculado e creditado automaticamente na wallet fallback',
      bonus,
      referral,
      walletCredit: {
        userId: referral.referrerId,
        amount: bonusAmount,
        withdrawable: true,
        pixWithdrawImmediate: true,
      },
    };
  }

  private async refreshPersistedReferral(tx: any, referral: any, now: Date) {
    if (
      referral.status === 'PHASE_1' &&
      (now >= referral.phase1EndAt ||
        Number(referral.phase1Earned) >= Number(referral.phase1Limit))
    ) {
      const phase2StartAt =
        now >= referral.phase1EndAt ? referral.phase1EndAt : now;

      return tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'PHASE_2',
          phase2StartAt,
          phase2EndAt: this.addMonths(phase2StartAt, 3),
        },
      });
    }

    if (
      referral.status === 'PHASE_2' &&
      ((referral.phase2EndAt && now >= referral.phase2EndAt) ||
        Number(referral.phase2Earned) >= Number(referral.phase2Limit) ||
        Number(referral.totalEarned) >= Number(referral.totalLimit))
    ) {
      return tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      });
    }

    return referral;
  }

  private async advanceOrCompletePersistedReferral(
    tx: any,
    referral: any,
    now: Date,
  ) {
    if (
      referral.status === 'PHASE_1' &&
      Number(referral.phase1Earned) >= Number(referral.phase1Limit)
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
          completedAt: now,
        },
      });
    }

    return referral;
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

  private refreshReferralPhase(referral: ReferralMock, now: Date) {
    if (
      referral.status === 'PHASE_1' &&
      (now >= referral.phase1EndAt || referral.phase1Earned >= 300)
    ) {
      referral.status = 'PHASE_2';
      referral.phase2StartAt =
        now >= referral.phase1EndAt ? referral.phase1EndAt : now;
      referral.phase2EndAt = this.addMonths(referral.phase2StartAt, 3);
      referral.updatedAt = now;
    }

    if (
      referral.status === 'PHASE_2' &&
      ((referral.phase2EndAt && now >= referral.phase2EndAt) ||
        referral.phase2Earned >= 200 ||
        referral.totalEarned >= 500)
    ) {
      referral.status = 'COMPLETED';
      referral.updatedAt = now;
    }
  }

  private advanceOrComplete(referral: ReferralMock, now: Date) {
    if (referral.status === 'PHASE_1' && referral.phase1Earned >= 300) {
      referral.status = 'PHASE_2';
      referral.phase2StartAt = now;
      referral.phase2EndAt = this.addMonths(now, 3);
    }

    if (
      referral.status === 'PHASE_2' &&
      (referral.phase2Earned >= 200 || referral.totalEarned >= 500)
    ) {
      referral.status = 'COMPLETED';
    }

    referral.updatedAt = now;
  }

  private toPublicReferral(referral: any) {
    return {
      ...referral,
      phase1Percent: Number(referral.phase1Percent ?? 0.05),
      phase1Limit: Number(referral.phase1Limit ?? 300),
      phase1Earned: Number(referral.phase1Earned ?? 0),
      phase2Percent: Number(referral.phase2Percent ?? 0.025),
      phase2Limit: Number(referral.phase2Limit ?? 200),
      phase2Earned: Number(referral.phase2Earned ?? 0),
      totalLimit: Number(referral.totalLimit ?? 500),
      totalEarned: Number(referral.totalEarned ?? 0),
    };
  }

  private toPublicBonus(bonus: any) {
    return {
      ...bonus,
      serviceValue: Number(bonus.serviceValue ?? 0),
      percentage: Number(bonus.percentage ?? 0),
      bonusAmount: Number(bonus.bonusAmount ?? 0),
    };
  }

  private toPublicWalletTransaction(transaction: any) {
    return {
      ...transaction,
      amount: Number(transaction.amount ?? 0),
    };
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private addMonths(date: Date, months: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}
