import { Injectable, Logger } from '@nestjs/common';
import { CreateReferralPremiumDto, ReferralBonusPreviewDto, ReferralReminderDto } from './referral-premium.dto';

export type ReferralPremiumPhase = 'PHASE_1_5_PERCENT' | 'PHASE_2_2_5_PERCENT' | 'ENDED';
export type ReferralPremiumAction = 'CREATED' | 'REMINDER_SCHEDULED' | 'BONUS_PREVIEW' | 'BONUS_APPROVED' | 'PROGRAM_ENDED';

export interface ReferralPremiumRule {
  phase: ReferralPremiumPhase;
  rate: number;
  maxBonus: number;
  maxMonths: number;
  label: string;
}

export interface ReferralPremiumRecord {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  phase: ReferralPremiumPhase;
  phaseOneBonus: number;
  phaseTwoBonus: number;
  totalBonus: number;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
}

export interface ReferralPremiumEvent {
  id: string;
  action: ReferralPremiumAction;
  referrerUserId: string;
  referredUserId?: string;
  orderId?: string;
  amount?: number;
  bonus?: number;
  phase?: ReferralPremiumPhase;
  message: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class ReferralPremiumService {
  private readonly logger = new Logger(ReferralPremiumService.name);
  private readonly referrals: ReferralPremiumRecord[] = [];
  private readonly events: ReferralPremiumEvent[] = [];

  private readonly rules: Record<Exclude<ReferralPremiumPhase, 'ENDED'>, ReferralPremiumRule> = {
    PHASE_1_5_PERCENT: {
      phase: 'PHASE_1_5_PERCENT',
      rate: 0.05,
      maxBonus: 300,
      maxMonths: 3,
      label: 'Fase 1: 5% por ate 3 meses ou ate R$300',
    },
    PHASE_2_2_5_PERCENT: {
      phase: 'PHASE_2_2_5_PERCENT',
      rate: 0.025,
      maxBonus: 200,
      maxMonths: 3,
      label: 'Fase 2: 2,5% por ate 3 meses ou ate R$200',
    },
  };

  createReferral(dto: CreateReferralPremiumDto): ReferralPremiumRecord {
    const existing = this.referrals.find(
      (item) => item.referrerUserId === dto.referrerUserId && item.referredUserId === dto.referredUserId,
    );

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const record: ReferralPremiumRecord = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      referrerUserId: dto.referrerUserId,
      referredUserId: dto.referredUserId,
      referralCode: dto.referralCode ?? `BORA-${dto.referrerUserId.slice(0, 6).toUpperCase()}`,
      phase: 'PHASE_1_5_PERCENT',
      phaseOneBonus: 0,
      phaseTwoBonus: 0,
      totalBonus: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.referrals.unshift(record);
    this.addEvent({
      action: 'CREATED',
      referrerUserId: record.referrerUserId,
      referredUserId: record.referredUserId,
      phase: record.phase,
      message: 'Indicacao premium criada. Usuario pode ganhar ate R$500 em recompensas.',
      metadata: { referralCode: record.referralCode },
    });

    return record;
  }

  previewBonus(dto: ReferralBonusPreviewDto) {
    const referral = this.ensureReferral(dto.referrerUserId, dto.referredUserId);
    const calculation = this.calculateBonus(referral, dto.serviceAmount);

    const event = this.addEvent({
      action: dto.dryRun ? 'BONUS_PREVIEW' : 'BONUS_APPROVED',
      referrerUserId: dto.referrerUserId,
      referredUserId: dto.referredUserId,
      orderId: dto.orderId,
      amount: dto.serviceAmount,
      bonus: calculation.bonus,
      phase: referral.phase,
      message: dto.dryRun
        ? 'Previa de bonus calculada sem creditar na carteira.'
        : 'Bonus de indicacao aprovado para integracao com wallet.',
      metadata: calculation,
    });

    if (!dto.dryRun && calculation.bonus > 0) {
      this.applyBonus(referral, calculation.bonus);
    }

    return {
      referral,
      calculation,
      event,
      walletInstruction: {
        shouldCredit: !dto.dryRun && calculation.bonus > 0,
        amount: calculation.bonus,
        reason: 'REFERRAL_PREMIUM_REWARD',
        idempotencyKey: `referral:${dto.referrerUserId}:${dto.referredUserId}:${dto.orderId}`,
      },
      pushInstruction: {
        eventType: 'REFERRAL_REWARD',
        title: 'Recompensa de indicacao recebida',
        body: `Voce ganhou R$${calculation.bonus.toFixed(2)} por indicacao.`,
        sound: 'referral_reward',
        haptic: 'success',
      },
    };
  }

  scheduleReminders(dto: ReferralReminderDto) {
    const createdAt = dto.createdAt ? new Date(dto.createdAt) : new Date();
    const reminders = [
      { label: '24 horas', days: 1, eventType: 'REFERRAL_REMINDER_24H' },
      { label: '3 dias', days: 3, eventType: 'REFERRAL_REMINDER_3D' },
      { label: '7 dias', days: 7, eventType: 'REFERRAL_REMINDER_7D' },
    ];

    return reminders.map((reminder) => {
      const scheduledAt = new Date(createdAt);
      scheduledAt.setDate(scheduledAt.getDate() + reminder.days);
      return this.addEvent({
        action: 'REMINDER_SCHEDULED',
        referrerUserId: dto.userId,
        phase: 'PHASE_1_5_PERCENT',
        message: `Lembrete de indicacao agendado para ${reminder.label}.`,
        metadata: {
          eventType: reminder.eventType,
          referralCode: dto.referralCode,
          scheduledAt: scheduledAt.toISOString(),
          stopAfter: '7_days',
          title: 'Indique e ganhe ate R$500 em recompensas',
        },
      });
    });
  }

  listReferrals(userId?: string): ReferralPremiumRecord[] {
    if (!userId) {
      return this.referrals.slice(0, 100);
    }
    return this.referrals.filter((item) => item.referrerUserId === userId || item.referredUserId === userId);
  }

  listEvents(userId?: string): ReferralPremiumEvent[] {
    if (!userId) {
      return this.events.slice(0, 100);
    }
    return this.events.filter((event) => event.referrerUserId === userId || event.referredUserId === userId);
  }

  getRules() {
    return {
      headline: 'Indique e ganhe ate R$500 em recompensas',
      maxTotalBonus: 500,
      phaseOne: this.rules.PHASE_1_5_PERCENT,
      phaseTwo: this.rules.PHASE_2_2_5_PERCENT,
      reminders: ['24 horas', '3 dias', '7 dias'],
      stopAutomaticRemindersAfter: '7 dias',
      note: 'Limite total do programa: R por indicador, sendo ate R na fase 1 e ate R na fase 2. Bonus real deve usar idempotencyKey por orderId para evitar duplicidade.',
    };
  }

  health() {
    return {
      status: 'ok',
      module: 'referral-premium',
      referralsInMemory: this.referrals.length,
      eventsInMemory: this.events.length,
      productionReady: false,
      nextIntegration: ['wallet real', 'push premium real', 'database persistence'],
    };
  }

  private ensureReferral(referrerUserId: string, referredUserId: string): ReferralPremiumRecord {
    return (
      this.referrals.find(
        (item) => item.referrerUserId === referrerUserId && item.referredUserId === referredUserId,
      ) ?? this.createReferral({ referrerUserId, referredUserId })
    );
  }

  private calculateBonus(referral: ReferralPremiumRecord, serviceAmount: number) {
    if (referral.phase === 'ENDED') {
      return { bonus: 0, reason: 'Programa de indicacao encerrado para esta relacao.', phase: referral.phase };
    }

    const rule = this.rules[referral.phase];
    const currentPhaseBonus = referral.phase === 'PHASE_1_5_PERCENT' ? referral.phaseOneBonus : referral.phaseTwoBonus;
    const remainingPhaseLimit = Math.max(0, rule.maxBonus - currentPhaseBonus);
    const remainingTotalLimit = Math.max(0, 500 - referral.totalBonus);
    const rawBonus = serviceAmount * rule.rate;
    const bonus = Math.max(0, Math.min(rawBonus, remainingPhaseLimit, remainingTotalLimit));

    return {
      bonus: Number(bonus.toFixed(2)),
      rate: rule.rate,
      phase: referral.phase,
      rule: rule.label,
      remainingPhaseLimit: Number(remainingPhaseLimit.toFixed(2)),
      remainingTotalLimit: Number(remainingTotalLimit.toFixed(2)),
      nextPhase: this.nextPhaseAfterBonus(referral, bonus),
    };
  }

  private applyBonus(referral: ReferralPremiumRecord, bonus: number) {
    if (referral.phase === 'PHASE_1_5_PERCENT') {
      referral.phaseOneBonus = Number((referral.phaseOneBonus + bonus).toFixed(2));
      referral.totalBonus = Number((referral.totalBonus + bonus).toFixed(2));
      if (referral.phaseOneBonus >= 300 || referral.totalBonus >= 500) {
        referral.phase = referral.totalBonus >= 500 ? 'ENDED' : 'PHASE_2_2_5_PERCENT';
      }
    } else if (referral.phase === 'PHASE_2_2_5_PERCENT') {
      referral.phaseTwoBonus = Number((referral.phaseTwoBonus + bonus).toFixed(2));
      referral.totalBonus = Number((referral.totalBonus + bonus).toFixed(2));
      if (referral.phaseTwoBonus >= 200 || referral.totalBonus >= 500) {
        referral.phase = 'ENDED';
        referral.endedAt = new Date().toISOString();
      }
    }
    referral.updatedAt = new Date().toISOString();
  }

  private nextPhaseAfterBonus(referral: ReferralPremiumRecord, bonus: number): ReferralPremiumPhase {
    if (referral.phase === 'PHASE_1_5_PERCENT') {
      const totalAfter = referral.totalBonus + bonus;
      const phaseOneAfter = referral.phaseOneBonus + bonus;
      if (totalAfter >= 500) return 'ENDED';
      if (phaseOneAfter >= 300) return 'PHASE_2_2_5_PERCENT';
      return 'PHASE_1_5_PERCENT';
    }
    if (referral.phase === 'PHASE_2_2_5_PERCENT') {
      const totalAfter = referral.totalBonus + bonus;
      const phaseTwoAfter = referral.phaseTwoBonus + bonus;
      if (totalAfter >= 500 || phaseTwoAfter >= 200) return 'ENDED';
      return 'PHASE_2_2_5_PERCENT';
    }
    return 'ENDED';
  }

  private addEvent(input: Omit<ReferralPremiumEvent, 'id' | 'createdAt'>): ReferralPremiumEvent {
    const event: ReferralPremiumEvent = {
      id: `ref_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.events.unshift(event);
    this.logger.log(`Referral premium event: ${event.action} -> ${event.referrerUserId}`);
    return event;
  }
}
