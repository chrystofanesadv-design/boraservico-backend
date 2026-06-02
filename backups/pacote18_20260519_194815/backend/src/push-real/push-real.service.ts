import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

import { getFirebasePrivateKey, readEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export type OperationalPushEvent =
  | 'ORDER_CREATED'
  | 'PROFESSIONAL_FOUND'
  | 'PROFESSIONAL_ON_THE_WAY'
  | 'CHECK_IN'
  | 'PROOF_UPLOADED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_RELEASED'
  | 'SERVICE_COMPLETED'
  | 'DISPUTE_OPENED';

interface PushInput {
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface OrderPushContext {
  orderId?: string;
  clientId?: string;
  professionalId?: string;
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
      throw new BadRequestException('token FCM invalido');
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
    return this.sendToUser(this.requireString(data?.userId, 'userId obrigatorio'), {
      title: this.readString(data?.title) ?? 'BoraServico',
      body:
        this.readString(data?.body ?? data?.message) ??
        'Nova notificacao BoraServico',
      data: data?.data,
    });
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
        status: context.status,
        serviceTitle: context.serviceTitle,
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

      this.logger.warn(`FCM send failed: ${message}`);

      return {
        success: false,
        sent: false,
        mode: 'firebase',
        reason: 'FCM_SEND_FAILED',
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
          professionalId: context.professionalId ?? order.professionalId ?? undefined,
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
    const both = [context.clientId, context.professionalId].filter(
      Boolean,
    ) as string[];

    if (eventType === 'ORDER_CREATED') {
      return context.clientId ? [context.clientId] : both;
    }

    if (
      eventType === 'PROFESSIONAL_ON_THE_WAY' ||
      eventType === 'CHECK_IN' ||
      eventType === 'PROOF_UPLOADED' ||
      eventType === 'PAYMENT_APPROVED'
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
      PROFESSIONAL_FOUND: {
        title: 'Profissional encontrado',
        body: `Encontramos um profissional para ${serviceTitle}.`,
      },
      PROFESSIONAL_ON_THE_WAY: {
        title: 'Profissional a caminho',
        body: `O profissional esta a caminho de ${serviceTitle}.`,
      },
      CHECK_IN: {
        title: 'Check-in realizado',
        body: `O atendimento ${serviceTitle} teve chegada confirmada.`,
      },
      PROOF_UPLOADED: {
        title: 'Prova enviada',
        body: `Uma nova prova foi anexada em ${serviceTitle}.`,
      },
      PAYMENT_APPROVED: {
        title: 'Pagamento aprovado',
        body: `O pagamento de ${serviceTitle} foi aprovado.`,
      },
      PAYMENT_RELEASED: {
        title: 'Pagamento liberado',
        body: `O pagamento de ${serviceTitle} foi liberado.`,
      },
      SERVICE_COMPLETED: {
        title: 'Servico concluido',
        body: `O atendimento ${serviceTitle} foi concluido.`,
      },
      DISPUTE_OPENED: {
        title: 'Disputa aberta',
        body: `Uma disputa foi aberta para ${serviceTitle}.`,
      },
    };

    return templates[eventType];
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

  private requireString(value: any, message: string) {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
  }
}
