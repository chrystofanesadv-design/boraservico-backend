import { Injectable, Logger } from '@nestjs/common';
import {
  PremiumPushBulkDto,
  PremiumPushEventType,
  PremiumPushPayloadDto,
  ReferralReminderScheduleDto,
} from './push-premium.dto';

type PremiumPushTone =
  | 'soft_ai_open'
  | 'radar_search'
  | 'professional_found'
  | 'accepted_ding'
  | 'modern_message'
  | 'counter_offer_tuum'
  | 'protected_payment_tlim'
  | 'arrival_ding'
  | 'check_tick'
  | 'checkout_premium_tick'
  | 'completion_reward'
  | 'referral_reward'
  | 'wallet_cash'
  | 'warning_soft';

type PremiumHaptic = 'light' | 'medium' | 'success' | 'warning' | 'error' | 'selection';

export interface PremiumPushTemplate {
  title: string;
  body: string;
  sound: PremiumPushTone;
  haptic: PremiumHaptic;
  priority: 'normal' | 'high' | 'urgent';
  channel: 'rfq' | 'negotiation' | 'payment' | 'tracking' | 'wallet' | 'referral' | 'dispute' | 'security';
  deepLink: string;
}

export interface PremiumPushRecord {
  id: string;
  userId: string;
  eventType: PremiumPushEventType;
  title: string;
  body: string;
  sound: PremiumPushTone;
  haptic: PremiumHaptic;
  priority: string;
  channel: string;
  deepLink: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  status: 'queued' | 'ready_for_fcm' | 'sent_locally';
}

@Injectable()
export class PushPremiumService {
  private readonly logger = new Logger(PushPremiumService.name);
  private readonly events: PremiumPushRecord[] = [];

  private readonly templates: Record<PremiumPushEventType, PremiumPushTemplate> = {
    RFQ_CREATED: {
      title: 'Pedido enviado com sucesso',
      body: 'A IA do BoraServiÃ§o estÃ¡ procurando profissionais compatÃ­veis para vocÃª.',
      sound: 'soft_ai_open',
      haptic: 'success',
      priority: 'high',
      channel: 'rfq',
      deepLink: '/client/rfq',
    },
    RFQ_RECEIVED: {
      title: 'Novo pedido compatÃ­vel',
      body: 'Um cliente prÃ³ximo precisa de um serviÃ§o que combina com seu perfil.',
      sound: 'professional_found',
      haptic: 'medium',
      priority: 'high',
      channel: 'rfq',
      deepLink: '/professional/negotiations',
    },
    QUOTE_SENT: {
      title: 'Proposta enviada',
      body: 'Sua proposta foi enviada e o cliente jÃ¡ pode responder.',
      sound: 'modern_message',
      haptic: 'light',
      priority: 'normal',
      channel: 'negotiation',
      deepLink: '/negotiations',
    },
    COUNTER_OFFER: {
      title: 'Nova contraproposta',
      body: 'A negociaÃ§Ã£o recebeu uma nova contraproposta.',
      sound: 'counter_offer_tuum',
      haptic: 'selection',
      priority: 'high',
      channel: 'negotiation',
      deepLink: '/negotiations',
    },
    QUOTE_ACCEPTED: {
      title: 'Proposta aceita',
      body: 'A proposta foi aceita. Continue pelo fluxo seguro do app.',
      sound: 'accepted_ding',
      haptic: 'success',
      priority: 'urgent',
      channel: 'negotiation',
      deepLink: '/orders',
    },
    QUOTE_REJECTED: {
      title: 'Proposta recusada',
      body: 'A proposta foi recusada. VocÃª pode ajustar a oferta ou aguardar outro pedido.',
      sound: 'modern_message',
      haptic: 'light',
      priority: 'normal',
      channel: 'negotiation',
      deepLink: '/negotiations',
    },
    PAYMENT_PROTECTED: {
      title: 'Pagamento protegido confirmado',
      body: 'O valor foi protegido no app. A missÃ£o pode avanÃ§ar com seguranÃ§a.',
      sound: 'protected_payment_tlim',
      haptic: 'success',
      priority: 'urgent',
      channel: 'payment',
      deepLink: '/wallet',
    },
    PROFESSIONAL_ON_THE_WAY: {
      title: 'Profissional a caminho',
      body: 'O profissional iniciou o deslocamento. Acompanhe o status da missÃ£o.',
      sound: 'radar_search',
      haptic: 'medium',
      priority: 'high',
      channel: 'tracking',
      deepLink: '/tracking',
    },
    PROFESSIONAL_ARRIVED: {
      title: 'Profissional chegou',
      body: 'O profissional informou chegada ao local. Confirme pelo app quando estiver tudo certo.',
      sound: 'arrival_ding',
      haptic: 'success',
      priority: 'urgent',
      channel: 'tracking',
      deepLink: '/tracking',
    },
    CHECK_IN: {
      title: 'Check-in registrado',
      body: 'O serviÃ§o foi iniciado com registro seguro de check-in.',
      sound: 'check_tick',
      haptic: 'success',
      priority: 'high',
      channel: 'tracking',
      deepLink: '/tracking',
    },
    CHECK_OUT: {
      title: 'Check-out registrado',
      body: 'O serviÃ§o foi finalizado e aguarda confirmaÃ§Ã£o/conclusÃ£o.',
      sound: 'checkout_premium_tick',
      haptic: 'success',
      priority: 'high',
      channel: 'tracking',
      deepLink: '/tracking',
    },
    SERVICE_COMPLETED: {
      title: 'ServiÃ§o concluÃ­do',
      body: 'MissÃ£o concluÃ­da. Avalie a experiÃªncia para melhorar o BoraServiÃ§o.',
      sound: 'completion_reward',
      haptic: 'success',
      priority: 'high',
      channel: 'tracking',
      deepLink: '/orders',
    },
    WALLET_CREDIT: {
      title: 'Saldo atualizado',
      body: 'Sua carteira recebeu uma nova movimentaÃ§Ã£o.',
      sound: 'wallet_cash',
      haptic: 'success',
      priority: 'high',
      channel: 'wallet',
      deepLink: '/wallet',
    },
    REFERRAL_REMINDER_24H: {
      title: 'Indique e ganhe atÃ© R$500',
      body: 'Convide amigos para o BoraServiÃ§o e acompanhe suas recompensas na carteira.',
      sound: 'referral_reward',
      haptic: 'light',
      priority: 'normal',
      channel: 'referral',
      deepLink: '/referral',
    },
    REFERRAL_REMINDER_3D: {
      title: 'Seu convite ainda pode render bÃ´nus',
      body: 'Compartilhe seu cÃ³digo e ganhe recompensas quando seus indicados usarem o app.',
      sound: 'referral_reward',
      haptic: 'light',
      priority: 'normal',
      channel: 'referral',
      deepLink: '/referral',
    },
    REFERRAL_REMINDER_7D: {
      title: 'Ãšltimo lembrete de indicaÃ§Ã£o',
      body: 'Depois deste lembrete, paramos as notificaÃ§Ãµes automÃ¡ticas de indicaÃ§Ã£o.',
      sound: 'referral_reward',
      haptic: 'selection',
      priority: 'normal',
      channel: 'referral',
      deepLink: '/referral',
    },
    REFERRAL_REWARD: {
      title: 'Recompensa de indicaÃ§Ã£o recebida',
      body: 'VocÃª ganhou bÃ´nus por indicaÃ§Ã£o. Veja o valor na sua carteira.',
      sound: 'referral_reward',
      haptic: 'success',
      priority: 'high',
      channel: 'referral',
      deepLink: '/referral',
    },
    DISPUTE_OPENED: {
      title: 'Disputa aberta',
      body: 'Uma disputa foi registrada. Acompanhe as evidÃªncias pelo app.',
      sound: 'warning_soft',
      haptic: 'warning',
      priority: 'urgent',
      channel: 'dispute',
      deepLink: '/disputes',
    },
    DISPUTE_UPDATED: {
      title: 'Disputa atualizada',
      body: 'HÃ¡ uma atualizaÃ§Ã£o importante na disputa.',
      sound: 'warning_soft',
      haptic: 'warning',
      priority: 'high',
      channel: 'dispute',
      deepLink: '/disputes',
    },
    ANTI_FRAUD_WARNING: {
      title: 'Aviso de seguranÃ§a',
      body: 'O BoraServiÃ§o bloqueou uma tentativa de contato externo antes do pagamento protegido.',
      sound: 'warning_soft',
      haptic: 'warning',
      priority: 'urgent',
      channel: 'security',
      deepLink: '/security',
    },
  };

  createEvent(payload: PremiumPushPayloadDto): PremiumPushRecord {
    const template = this.templates[payload.eventType];

    if (!template) {
      throw new Error(`Tipo de push premium nao suportado: ${payload.eventType}`);
    }

    const record: PremiumPushRecord = {
      id: `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: payload.userId ?? 'local-preview-user',
      eventType: payload.eventType,
      title: payload.title ?? template.title,
      body: payload.body ?? template.body,
      sound: template.sound,
      haptic: template.haptic,
      priority: template.priority,
      channel: template.channel,
      deepLink: payload.deepLink ?? template.deepLink,
      metadata: {
        orderId: payload.orderId,
        rfqId: payload.rfqId,
        negotiationId: payload.negotiationId,
        amount: payload.amount,
        role: payload.role,
        ...(payload.metadata ?? {}),
      },
      createdAt: new Date().toISOString(),
      status: 'ready_for_fcm',
    };

    this.events.unshift(record);
    this.logger.log(`Premium push ready: ${record.eventType} -> ${record.userId}`);
    return record;
  }

  createBulk(dto: PremiumPushBulkDto): PremiumPushRecord[] {
    const safeUsers = Array.isArray(dto.userIds) ? dto.userIds.filter(Boolean) : [];
    return safeUsers.map((userId) =>
      this.createEvent({
        userId,
        eventType: dto.eventType,
        title: dto.title,
        body: dto.body,
        orderId: dto.orderId,
        rfqId: dto.rfqId,
        negotiationId: dto.negotiationId,
        deepLink: dto.deepLink,
        metadata: dto.metadata,
      }),
    );
  }

  scheduleReferralReminders(dto: ReferralReminderScheduleDto): PremiumPushRecord[] {
    const createdAt = dto.createdAt ? new Date(dto.createdAt) : new Date();

    const reminders: Array<{ eventType: PremiumPushEventType; delayDays: number }> = [
      { eventType: 'REFERRAL_REMINDER_24H', delayDays: 1 },
      { eventType: 'REFERRAL_REMINDER_3D', delayDays: 3 },
      { eventType: 'REFERRAL_REMINDER_7D', delayDays: 7 },
    ];

    return reminders.map((reminder) => {
      const scheduledAt = new Date(createdAt);
      scheduledAt.setDate(scheduledAt.getDate() + reminder.delayDays);

      return this.createEvent({
        userId: dto.userId,
        eventType: reminder.eventType,
        metadata: {
          referralCode: dto.referralCode,
          scheduledAt: scheduledAt.toISOString(),
          stopAfter: '7_days',
        },
      });
    });
  }

  listEvents(userId?: string): PremiumPushRecord[] {
    if (!userId) {
      return this.events.slice(0, 100);
    }

    return this.events.filter((event) => event.userId === userId).slice(0, 100);
  }

  getTemplates(): Record<PremiumPushEventType, PremiumPushTemplate> {
    return this.templates;
  }

  health() {
    return {
      status: 'ok',
      module: 'push-premium',
      eventsInMemory: this.events.length,
      supportedEvents: Object.keys(this.templates),
      productionReady: false,
      note:
        'Modulo preparado para Firebase/FCM real. Quando as credenciais estiverem configuradas, trocar status ready_for_fcm por envio real.',
    };
  }
}

