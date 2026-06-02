import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

import { getFirebasePrivateKey, readEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export type OperationalPushEvent =
  | 'ORDER_CREATED'
  | 'RFQ_RECEIVED'
  | 'PROFESSIONAL_FOUND'
  | 'NEW_REQUEST'
  | 'PROPOSAL_RECEIVED'
  | 'COUNTER_OFFER_RECEIVED'
  | 'FINAL_OFFER_RECEIVED'
  | 'PROPOSAL_ACCEPTED'
  | 'SEARCH_EXPANDED'
  | 'CLIENT_WAITING'
  | 'DISPLACEMENT_STARTED'
  | 'PROFESSIONAL_ON_THE_WAY'
  | 'PROFESSIONAL_ARRIVED'
  | 'PROFESSIONAL_NEARBY'
  | 'CHECK_IN'
  | 'SERVICE_STARTED'
  | 'SERVICE_IN_PROGRESS'
  | 'CHECK_OUT'
  | 'SERVICE_FINISHED'
  | 'PROOF_UPLOADED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_CONFIRMED'
  | 'CONTACT_RELEASED'
  | 'SERVICE_SCHEDULED'
  | 'PAYMENT_RELEASED'
  | 'SERVICE_COMPLETED'
  | 'DISPUTE_OPENED'
  | 'REFERRAL_REMINDER_24H'
  | 'REFERRAL_REMINDER_3D'
  | 'REFERRAL_REMINDER_7D';

interface PushInput {
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface OrderPushContext {
  orderId?: string;
  clientId?: string;
  professionalId?: string;
  professionalIds?: string[];
  requestId?: string;
  negotiationId?: string;
  serviceTitle?: string;
  status?: string;
  amount?: number;
  reason?: string;
}

@Injectable()
export class PushRealService {
  private readonly logger = new Logger(PushRealService.name);
  private firebaseInitialized = false;
  private firebaseInitAttempted = false;
  private firebaseInitError?: string;

  constructor(private readonly prisma: PrismaService) {}

  status() {
    const envReady = this.hasFirebaseEnv();
    const firebaseReady = envReady ? this.ensureFirebase() : false;

    return {
      success: true,
      module: 'push-real',
      firebaseEnvReady: envReady,
      firebaseAdminReady: firebaseReady,
      fallbackMode: envReady ? 'firebase-or-error' : 'clean-skip',
      tokenPersistence: 'database:user.fcmToken',
      realtimeEvents: this.eventCatalog(),
      firebaseReadyWithoutCredentials: true,
      timestamp: new Date().toISOString(),
    };
  }

  async registerToken(
    userId: string | undefined,
    token: string | undefined,
    metadata: Record<string, any> = {},
  ) {
    const normalizedUserId = this.requireString(userId, 'userId obrigatorio');
    const normalizedToken = this.requireString(token, 'token FCM obrigatorio');

    if (normalizedToken.length < 20) {
      throw new BadRequestException('Token FCM inválido');
    }

    const user = await this.prisma.user
      .update({
        where: { id: normalizedUserId },
        data: { fcmToken: normalizedToken },
        select: {
          id: true,
          role: true,
        },
      })
      .catch(() => null);

    if (!user) {
      throw new BadRequestException('Usuario nao encontrado para token FCM');
    }

    this.logger.log(
      `FCM token registered for user ${user.id} (${user.role}) via ${this.readString(metadata.source) ?? 'api'}`,
    );

    return {
      success: true,
      userId: user.id,
      role: user.role,
      tokenSaved: true,
      tokenStoredIn: 'database',
      tokenExposed: false,
      savedAt: new Date().toISOString(),
    };
  }

  async listRegisteredTokens() {
    const users = await this.prisma.user.findMany({
      where: {
        fcmToken: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return users.map((user) => ({
      ...user,
      tokenRegistered: true,
      tokenExposed: false,
    }));
  }

  async send(data: {
    userId?: string;
    title?: string;
    body?: string;
    message?: string;
    data?: Record<string, any>;
  }) {
    return this.sendToUser(
      this.requireString(data?.userId, 'userId obrigatorio'),
      {
        title: this.readString(data?.title) ?? 'BoraServico',
        body:
          this.readString(data?.body ?? data?.message) ??
          'Nova notificacao BoraServico',
        data: data?.data,
      },
    );
  }

  async sendToUser(userId: string, input: PushInput) {
    const normalizedUserId = this.requireString(userId, 'userId obrigatorio');
    const user = await this.prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: {
        id: true,
        role: true,
        fcmToken: true,
      },
    });

    if (!user?.fcmToken) {
      return {
        success: true,
        sent: false,
        userId: normalizedUserId,
        reason: 'FCM_TOKEN_NOT_FOUND',
        tokenExposed: false,
      };
    }

    return this.sendToToken(user.fcmToken, input, {
      userId: user.id,
      role: user.role,
    });
  }

  async sendToUsers(userIds: string[], input: PushInput) {
    const uniqueUserIds = Array.from(
      new Set(userIds.map((userId) => this.readString(userId)).filter(Boolean)),
    ) as string[];

    if (uniqueUserIds.length === 0) {
      return {
        success: true,
        sent: false,
        reason: 'NO_RECIPIENTS',
        results: [],
      };
    }

    const results = await Promise.all(
      uniqueUserIds.map((userId) => this.sendToUser(userId, input)),
    );

    return {
      success: true,
      sent: results.some((result) => result.sent),
      totalRecipients: uniqueUserIds.length,
      results,
    };
  }

  async notifyOrderEvent(
    eventType: OperationalPushEvent,
    payload: Record<string, any> = {},
  ) {
    const context = await this.resolveOrderContext(payload);
    const template = this.templateFor(eventType, context);
    const recipients = this.recipientsFor(eventType, context);

    return this.sendToUsers(recipients, {
      title: template.title,
      body: template.body,
      data: this.toFcmData({
        eventType,
        orderId: context.orderId,
        requestId: context.requestId,
        negotiationId: context.negotiationId,
        status: context.status,
        serviceTitle: context.serviceTitle,
      }),
    });
  }

  async notifyReferralReminder(
    userId: string,
    phase: '24h' | '3d' | '7d',
    payload: Record<string, any> = {},
  ) {
    const eventType: OperationalPushEvent =
      phase === '24h'
        ? 'REFERRAL_REMINDER_24H'
        : phase === '3d'
          ? 'REFERRAL_REMINDER_3D'
          : 'REFERRAL_REMINDER_7D';
    const template = this.templateFor(eventType, {});

    return this.sendToUser(userId, {
      title: template.title,
      body: template.body,
      data: this.toFcmData({
        ...payload,
        eventType,
        referralPhase: phase,
      }),
    });
  }

  async sendToToken(
    token: string,
    input: PushInput,
    context: Record<string, any> = {},
  ) {
    const title = this.requireString(input.title, 'titulo obrigatorio');
    const body = this.requireString(input.body, 'mensagem obrigatoria');

    if (!this.ensureFirebase()) {
      return {
        success: true,
        sent: false,
        mode: 'fallback',
        reason: this.firebaseInitError ?? 'FIREBASE_ENV_MISSING',
        firebaseConfigured: this.hasFirebaseEnv(),
        title,
        body,
        data: this.toFcmData(input.data ?? {}),
        tokenExposed: false,
        ...this.publicContext(context),
        sentAt: new Date().toISOString(),
      };
    }

    try {
      const response = await admin.messaging().send({
        token,
        notification: {
          title,
          body,
        },
        data: this.toFcmData(input.data ?? {}),
        android: {
          priority: 'high',
          notification: {
            channelId: 'boraservico_operational',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              sound: 'default',
              contentAvailable: true,
            },
          },
        },
      });

      return {
        success: true,
        sent: true,
        mode: 'firebase',
        response,
        tokenExposed: false,
        ...this.publicContext(context),
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao enviar push FCM';
      const code = this.readString((error as any)?.errorInfo?.code);

      this.logger.warn(`FCM send failed: ${message}`);

      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        await this.clearInvalidToken(token, context);
      }

      return {
        success: false,
        sent: false,
        mode: 'firebase',
        reason: 'FCM_SEND_FAILED',
        code,
        message,
        tokenExposed: false,
        ...this.publicContext(context),
        sentAt: new Date().toISOString(),
      };
    }
  }

  private ensureFirebase() {
    if (this.firebaseInitialized) {
      return true;
    }

    if (this.firebaseInitAttempted && this.firebaseInitError) {
      return false;
    }

    this.firebaseInitAttempted = true;

    const projectId = readEnv('FIREBASE_PROJECT_ID');
    const clientEmail = readEnv('FIREBASE_CLIENT_EMAIL');
    const privateKey = getFirebasePrivateKey();

    if (!projectId || !clientEmail || !privateKey) {
      this.firebaseInitError = 'FIREBASE_ENV_MISSING';
      return false;
    }

    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      }

      this.firebaseInitialized = true;
      this.firebaseInitError = undefined;
      return true;
    } catch (error) {
      this.firebaseInitError = 'FIREBASE_INIT_FAILED';
      this.logger.warn(
        `Firebase Admin initialization skipped: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return false;
    }
  }

  private hasFirebaseEnv() {
    return Boolean(
      readEnv('FIREBASE_PROJECT_ID') &&
      readEnv('FIREBASE_CLIENT_EMAIL') &&
      getFirebasePrivateKey(),
    );
  }

  private async clearInvalidToken(token: string, context: Record<string, any>) {
    const userId = this.readString(context?.userId);

    if (!userId) {
      return;
    }

    await this.prisma.user
      .updateMany({
        where: {
          id: userId,
          fcmToken: token,
        },
        data: {
          fcmToken: null,
        },
      })
      .catch(() => undefined);
  }

  private async resolveOrderContext(
    payload: Record<string, any>,
  ): Promise<OrderPushContext> {
    const orderId = this.readString(
      payload.orderId ?? payload.id ?? payload.order?.id,
    );
    let context: OrderPushContext = {
      orderId,
      clientId: this.readString(payload.clientId ?? payload.order?.clientId),
      professionalId: this.readString(
        payload.professionalId ?? payload.order?.professionalId,
      ),
      professionalIds: this.readStringArray(
        payload.professionalIds ?? payload.recipientIds,
      ),
      requestId: this.readString(payload.requestId ?? payload.rfqId),
      negotiationId: this.readString(payload.negotiationId),
      serviceTitle: this.readString(
        payload.serviceTitle ?? payload.title ?? payload.order?.title,
      ),
      status: this.readString(payload.status ?? payload.order?.status),
      amount: this.readNumber(payload.amount ?? payload.estimatedPrice),
      reason: this.readString(payload.reason ?? payload.message),
    };

    if (
      context.orderId &&
      (!context.clientId || !context.professionalId || !context.serviceTitle)
    ) {
      const order = await this.prisma.serviceOrder
        .findUnique({
          where: { id: context.orderId },
          select: {
            id: true,
            clientId: true,
            professionalId: true,
            title: true,
            status: true,
            price: true,
          },
        })
        .catch(() => null);

      if (order) {
        context = {
          ...context,
          orderId: order.id,
          clientId: context.clientId ?? order.clientId,
          professionalId:
            context.professionalId ?? order.professionalId ?? undefined,
          serviceTitle: context.serviceTitle ?? order.title,
          status: context.status ?? order.status,
          amount: context.amount ?? Number(order.price ?? 0),
        };
      }
    }

    return context;
  }

  private recipientsFor(
    eventType: OperationalPushEvent,
    context: OrderPushContext,
  ) {
    if (
      eventType === 'NEW_REQUEST' ||
      eventType === 'RFQ_RECEIVED' ||
      eventType === 'CLIENT_WAITING' ||
      eventType === 'COUNTER_OFFER_RECEIVED'
    ) {
      return context.professionalIds?.length
        ? context.professionalIds
        : context.professionalId
          ? [context.professionalId]
          : [];
    }

    if (
      eventType === 'PROPOSAL_RECEIVED' ||
      eventType === 'FINAL_OFFER_RECEIVED' ||
      eventType === 'SEARCH_EXPANDED'
    ) {
      return context.clientId ? [context.clientId] : [];
    }

    if (eventType === 'PROPOSAL_ACCEPTED') {
      return context.professionalId ? [context.professionalId] : [];
    }

    const both = [context.clientId, context.professionalId].filter(
      Boolean,
    ) as string[];

    if (eventType === 'ORDER_CREATED') {
      return context.clientId ? [context.clientId] : both;
    }

    if (
      eventType === 'PROFESSIONAL_ON_THE_WAY' ||
      eventType === 'DISPLACEMENT_STARTED' ||
      eventType === 'PROFESSIONAL_ARRIVED' ||
      eventType === 'PROFESSIONAL_NEARBY' ||
      eventType === 'CHECK_IN' ||
      eventType === 'SERVICE_STARTED' ||
      eventType === 'SERVICE_IN_PROGRESS' ||
      eventType === 'CHECK_OUT' ||
      eventType === 'SERVICE_FINISHED' ||
      eventType === 'PROOF_UPLOADED' ||
      eventType === 'PAYMENT_APPROVED' ||
      eventType === 'PAYMENT_CONFIRMED' ||
      eventType === 'CONTACT_RELEASED' ||
      eventType === 'SERVICE_COMPLETED'
    ) {
      return context.clientId ? [context.clientId] : both;
    }

    if (
      eventType === 'REFERRAL_REMINDER_24H' ||
      eventType === 'REFERRAL_REMINDER_3D' ||
      eventType === 'REFERRAL_REMINDER_7D'
    ) {
      return context.clientId ? [context.clientId] : both;
    }

    return both;
  }

  private templateFor(
    eventType: OperationalPushEvent,
    context: OrderPushContext,
  ) {
    const serviceTitle = context.serviceTitle || 'seu atendimento';
    const templates: Record<OperationalPushEvent, PushInput> = {
      ORDER_CREATED: {
        title: 'Ordem criada',
        body: `Recebemos a solicitacao de ${serviceTitle}.`,
      },
      RFQ_RECEIVED: {
        title: 'Novo RFQ recebido',
        body: `Novo pedido disponivel para ${serviceTitle}.`,
      },
      PROFESSIONAL_FOUND: {
        title: 'Profissional encontrado',
        body: `Encontramos um profissional para ${serviceTitle}.`,
      },
      DISPLACEMENT_STARTED: {
        title: 'Deslocamento iniciado',
        body: `O profissional iniciou a rota para ${serviceTitle}.`,
      },
      PROFESSIONAL_ON_THE_WAY: {
        title: 'Profissional a caminho',
        body: `O profissional esta a caminho de ${serviceTitle}.`,
      },
      PROFESSIONAL_ARRIVED: {
        title: 'Profissional chegou',
        body: 'Seu profissional chegou.',
      },
      PROFESSIONAL_NEARBY: {
        title: 'Profissional proximo',
        body: 'O profissional esta chegando ao local do servico.',
      },
      CHECK_IN: {
        title: 'Profissional chegou',
        body: 'Seu profissional chegou.',
      },
      SERVICE_STARTED: {
        title: 'Servico iniciado',
        body: `O atendimento ${serviceTitle} comecou.`,
      },
      SERVICE_IN_PROGRESS: {
        title: 'Servico em andamento',
        body: `O atendimento ${serviceTitle} comecou.`,
      },
      CHECK_OUT: {
        title: 'Check-out enviado',
        body: `O profissional finalizou ${serviceTitle} e enviou a prova.`,
      },
      SERVICE_FINISHED: {
        title: 'Servico finalizado',
        body: `O atendimento ${serviceTitle} foi finalizado. Confira a prova enviada.`,
      },
      PROOF_UPLOADED: {
        title: 'Prova enviada',
        body: `Uma nova prova foi anexada em ${serviceTitle}.`,
      },
      NEW_REQUEST: {
        title: 'Nova solicitacao',
        body: `Novo pedido disponivel para ${serviceTitle}. Resposta rapida aumenta suas chances.`,
      },
      PROPOSAL_RECEIVED: {
        title: 'Nova proposta recebida',
        body: `Um profissional respondeu para ${serviceTitle}.`,
      },
      COUNTER_OFFER_RECEIVED: {
        title: 'Contraproposta recebida',
        body: `Cliente enviou uma contraproposta para ${serviceTitle}.`,
      },
      FINAL_OFFER_RECEIVED: {
        title: 'Proposta final recebida',
        body: `O profissional enviou a proposta final para ${serviceTitle}.`,
      },
      PROPOSAL_ACCEPTED: {
        title: 'Orcamento aceito',
        body: `Cliente aceitou sua proposta para ${serviceTitle}.`,
      },
      SEARCH_EXPANDED: {
        title: 'Busca ampliada',
        body: `Estamos ampliando a busca para ${serviceTitle}.`,
      },
      CLIENT_WAITING: {
        title: 'Cliente aguardando',
        body: `Cliente aguarda sua resposta para ${serviceTitle}.`,
      },
      PAYMENT_APPROVED: {
        title: 'Pagamento aprovado',
        body: `O pagamento de ${serviceTitle} foi aprovado.`,
      },
      PAYMENT_CONFIRMED: {
        title: 'Pagamento confirmado',
        body: `Pagamento protegido confirmado para ${serviceTitle}.`,
      },
      CONTACT_RELEASED: {
        title: 'Contato liberado',
        body: `Contato liberado com segurança para ${serviceTitle}.`,
      },
      SERVICE_SCHEDULED: {
        title: 'Servico agendado',
        body: `O atendimento ${serviceTitle} foi agendado.`,
      },
      PAYMENT_RELEASED: {
        title: 'Pagamento liberado',
        body: `O pagamento de ${serviceTitle} foi liberado.`,
      },
      SERVICE_COMPLETED: {
        title: 'Servico concluido',
        body: `O atendimento ${serviceTitle} foi concluído.`,
      },
      DISPUTE_OPENED: {
        title: 'Disputa aberta',
        body: `Uma disputa foi aberta para ${serviceTitle}.`,
      },
      REFERRAL_REMINDER_24H: {
        title: 'Indicação disponível',
        body: 'Convide alguém em até 24h e acompanhe seu bônus BoraServiço.',
      },
      REFERRAL_REMINDER_3D: {
        title: 'Seu bônus pode evoluir',
        body: 'A indicação segue ativa. Continue acompanhando a progressão.',
      },
      REFERRAL_REMINDER_7D: {
        title: 'Último lembrete da indicação',
        body: 'Confira sua indicação antes do ciclo semanal encerrar.',
      },
    };

    return templates[eventType];
  }

  private eventCatalog() {
    return [
      'RFQ_RECEIVED',
      'NEW_REQUEST',
      'PROPOSAL_RECEIVED',
      'COUNTER_OFFER_RECEIVED',
      'PROPOSAL_ACCEPTED',
      'DISPLACEMENT_STARTED',
      'PROFESSIONAL_ON_THE_WAY',
      'PROFESSIONAL_ARRIVED',
      'CHECK_IN',
      'SERVICE_STARTED',
      'SERVICE_IN_PROGRESS',
      'CHECK_OUT',
      'SERVICE_FINISHED',
      'PROOF_UPLOADED',
      'PAYMENT_CONFIRMED',
      'CONTACT_RELEASED',
      'SERVICE_COMPLETED',
      'REFERRAL_REMINDER_24H',
      'REFERRAL_REMINDER_3D',
      'REFERRAL_REMINDER_7D',
    ];
  }

  private toFcmData(data: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );
  }

  private publicContext(context: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(context).filter(
        ([key, value]) =>
          value !== undefined &&
          value !== null &&
          !key.toLowerCase().includes('token'),
      ),
    );
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private readNumber(value: any) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private readStringArray(value: any) {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const normalized = value
      .map((item) => this.readString(item))
      .filter(Boolean) as string[];

    return normalized.length ? Array.from(new Set(normalized)) : undefined;
  }

  private requireString(value: any, message: string) {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
  }
}
