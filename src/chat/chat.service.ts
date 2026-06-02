import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  containsOperationalResidue,
  filterDirectContact,
  repairLegacyEncoding,
} from '../security/contact-filter';

export type ChatSenderRole = 'CLIENT' | 'PROFESSIONAL' | 'SYSTEM' | 'ADMIN';

export interface ChatActor {
  userId?: string;
  role?: string;
}

export interface SendMessageData {
  orderId: string;
  senderId?: string;
  senderRole?: ChatSenderRole;
  message: string;
}

export interface TypingData {
  orderId: string;
  senderId?: string;
  isTyping?: boolean;
}

export interface ChatMessageResponse {
  success: true;
  id: string;
  orderId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  message: string;
  read: boolean;
  createdAt: string;
  readAt: string | null;
  timestamp: string;
}

export interface FindMessagesOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedMessagesResult {
  messages: ChatMessageResponse[];
  nextCursor: string | null;
}

export interface TypingResponse {
  success: true;
  orderId: string;
  senderId: string;
  isTyping: boolean;
  timestamp: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly paymentsService?: PaymentsService,
  ) {}

  async findAll(): Promise<ChatMessageResponse[]> {
    const messages = await this.prisma.chatMessage.findMany({
      orderBy: { createdAt: 'asc' },
      take: 300,
    });

    return messages
      .filter((message) => this.isVisibleProductionMessage(message))
      .map((message) => this.toPublicMessage(message));
  }

  async findByOrder(
    orderId: string,
    actor?: ChatActor,
    options?: FindMessagesOptions,
  ): Promise<PaginatedMessagesResult> {
    const normalizedOrderId = this.requireString(
      orderId,
      'orderId obrigatorio',
    );

    await this.assertOrderAccess(normalizedOrderId, actor);

    const { cursor, limit = 50 } = options ?? {};

    const messages = await this.prisma.chatMessage.findMany({
      where: { orderId: normalizedOrderId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });

    const hasMore = messages.length > limit;
    const results = (hasMore ? messages.slice(0, -1) : messages).filter(
      (message) => this.isVisibleProductionMessage(message),
    );

    return {
      messages: results.map((message) => this.toPublicMessage(message)),
      nextCursor:
        hasMore && results.length > 0 ? results[results.length - 1].id : null,
    };
  }

  async sendMessage(
    data: SendMessageData,
    actor?: ChatActor,
  ): Promise<ChatMessageResponse> {
    const orderId = this.requireString(data?.orderId, 'orderId obrigatorio');
    const senderId = this.readString(data?.senderId) ?? actor?.userId;
    const messageText = this.requireString(
      data?.message,
      'mensagem obrigatoria',
    );

    if (!senderId) {
      throw new BadRequestException('senderId obrigatorio');
    }

    this.logger.debug(`Sending message to order ${orderId}`, {
      senderId,
      role: actor?.role,
    });

    await this.assertOrderAccess(orderId, actor ?? { userId: senderId });

    const contactUnlocked = await this.hasContactUnlocked(
      orderId,
      actor ?? { userId: senderId },
    );

    if (!contactUnlocked) {
      const contactFilter = filterDirectContact(messageText);

      if (contactFilter.blocked) {
        throw new BadRequestException({
          error: 'DIRECT_CONTACT_BLOCKED',
          message: contactFilter.message,
          reasons: contactFilter.reasons,
          cleanMessage: contactFilter.cleanMessage,
        });
      }
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        orderId,
        senderId,
        senderRole: this.normalizeRole(data?.senderRole ?? actor?.role),
        message: messageText,
      },
    });

    return this.toPublicMessage(message);
  }

  async markAsRead(
    messageId: string,
    actor?: ChatActor,
  ): Promise<ChatMessageResponse> {
    const normalizedMessageId = this.requireString(
      messageId,
      'messageId obrigatorio',
    );

    const existing = await this.prisma.chatMessage.findUnique({
      where: { id: normalizedMessageId },
      include: { order: true },
    });

    if (!existing) {
      throw new NotFoundException('Mensagem nao encontrada');
    }

    this.assertOrderObjectAccess(existing.order, actor);

    const message = await this.prisma.chatMessage.update({
      where: { id: normalizedMessageId },
      data: { readAt: existing.readAt ?? new Date() },
    });

    return this.toPublicMessage(message);
  }

  async typing(data: TypingData, actor?: ChatActor): Promise<TypingResponse> {
    const orderId = this.requireString(data?.orderId, 'orderId obrigatorio');
    const senderId = this.readString(data?.senderId) ?? actor?.userId;

    if (!senderId) {
      throw new BadRequestException('senderId obrigatorio');
    }

    await this.assertOrderAccess(orderId, actor ?? { userId: senderId });

    return {
      success: true,
      orderId,
      senderId,
      isTyping: data?.isTyping !== false,
      timestamp: new Date().toISOString(),
    };
  }

  async seedDemo(
    orderId: string,
    actor?: ChatActor,
  ): Promise<{ success: true; messages: ChatMessageResponse[] }> {
    void orderId;
    void actor;
    return {
      success: true,
      messages: [],
    };
  }

  private async assertOrderAccess(
    orderId: string,
    actor?: ChatActor,
  ): Promise<void> {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        professionalId: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Ordem nao encontrada');
    }

    this.assertOrderObjectAccess(order, actor);
  }

  private assertOrderObjectAccess(order: any, actor?: ChatActor): void {
    if (this.isAdmin(actor)) {
      return;
    }

    const userId = this.readString(actor?.userId);

    if (
      userId &&
      (order.clientId === userId || order.professionalId === userId)
    ) {
      return;
    }

    throw new ForbiddenException('Acesso negado ao chat desta ordem');
  }

  private async assertContactUnlocked(
    orderId: string,
    actor?: ChatActor,
  ): Promise<void> {
    if (await this.hasContactUnlocked(orderId, actor)) {
      return;
    }

    throw new ForbiddenException(
      'Contato liberado apos confirmacao do pagamento protegido.',
    );
  }

  private async hasContactUnlocked(
    orderId: string,
    actor?: ChatActor,
  ): Promise<boolean> {
    if (this.isAdmin(actor)) {
      return true;
    }

    try {
      const status = await this.paymentsService?.getOrderStatus(orderId);
      const paymentStatus = this.readString(status?.status);

      if (
        paymentStatus &&
        ['PAID', 'ESCROW_HELD', 'RELEASED', 'SPLIT_DONE'].includes(
          paymentStatus,
        )
      ) {
        return true;
      }
    } catch {
      // A falta de pagamento mantém o chat bloqueado por segurança.
    }

    return false;
  }

  private toPublicMessage(message: any): ChatMessageResponse {
    const createdAt =
      message.createdAt?.toISOString?.() ??
      message.createdAt ??
      new Date().toISOString();

    const readAt = message.readAt?.toISOString?.() ?? message.readAt;

    return {
      success: true,
      id: message.id,
      orderId: message.orderId,
      senderId: message.senderId,
      senderRole: this.normalizeRole(message.senderRole),
      message: repairLegacyEncoding(message.message) ?? message.message,
      read: Boolean(message.readAt),
      createdAt,
      readAt: readAt ?? null,
      timestamp: createdAt,
    };
  }

  private isVisibleProductionMessage(message: any): boolean {
    return !containsOperationalResidue(
      [
        message?.id,
        message?.orderId,
        message?.senderId,
        message?.senderRole,
        message?.message,
      ].join(' '),
    );
  }

  private normalizeRole(value: any): ChatSenderRole {
    const role = this.readString(value)?.toUpperCase();

    if (
      role === 'CLIENT' ||
      role === 'PROFESSIONAL' ||
      role === 'SYSTEM' ||
      role === 'ADMIN'
    ) {
      return role;
    }

    return 'SYSTEM';
  }

  private isAdmin(actor?: ChatActor): boolean {
    return this.readString(actor?.role)?.toUpperCase() === 'ADMIN';
  }

  private readString(value: any): string | undefined {
    const text = repairLegacyEncoding(value)?.trim();

    return text && text.length > 0 ? text : undefined;
  }

  private requireString(value: any, message: string): string {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
  }
}
