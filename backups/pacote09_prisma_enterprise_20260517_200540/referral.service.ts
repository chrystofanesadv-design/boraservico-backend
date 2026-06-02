import { Injectable } from '@nestjs/common';

type ReferralStatus =
  | 'PHASE_1'
  | 'PHASE_2'
  | 'COMPLETED';

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

  createReferral(data: any) {
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

  listReferrals() {
    return this.referrals;
  }

  listBonuses() {
    return this.bonuses;
  }

  findReferral(id: string) {
    return this.referrals.find((item) => item.id === id) ?? null;
  }

  calculateBonus(data: any) {
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

    const bonusAmount = Math.min(
      rawBonus,
      phaseLimitRemaining,
      totalLimitRemaining,
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
      message: 'Bonus calculado e creditado automaticamente na wallet mock',
      bonus,
      referral,
      walletCredit: {
        userId: referral.referrerId,
        amount: bonusAmount,
        withdrawable: true,
      },
    };
  }

  private refreshReferralPhase(referral: ReferralMock, now: Date) {
    if (
      referral.status === 'PHASE_1' &&
      (now >= referral.phase1EndAt || referral.phase1Earned >= 300)
    ) {
      referral.status = 'PHASE_2';
      referral.phase2StartAt = now;
      referral.phase2EndAt = this.addMonths(now, 3);
      referral.updatedAt = now;
    }

    if (
      referral.status === 'PHASE_2' &&
      (
        (referral.phase2EndAt && now >= referral.phase2EndAt) ||
        referral.phase2Earned >= 200 ||
        referral.totalEarned >= 500
      )
    ) {
      referral.status = 'COMPLETED';
      referral.updatedAt = now;
    }
  }

  private advanceOrComplete(referral: ReferralMock, now: Date) {
    if (
      referral.status === 'PHASE_1' &&
      referral.phase1Earned >= 300
    ) {
      referral.status = 'PHASE_2';
      referral.phase2StartAt = now;
      referral.phase2EndAt = this.addMonths(now, 3);
    }

    if (
      referral.status === 'PHASE_2' &&
      (
        referral.phase2Earned >= 200 ||
        referral.totalEarned >= 500
      )
    ) {
      referral.status = 'COMPLETED';
    }

    referral.updatedAt = now;
  }

  private addMonths(date: Date, months: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}
