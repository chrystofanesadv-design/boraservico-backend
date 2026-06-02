import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type ChatSenderRole = 'CLIENT' | 'PROFESSIONAL' | 'SYSTEM' | 'ADMIN';

interface ChatActor {
  userId?: string;
  role?: string;
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const messages = await this.prisma.chatMessage.findMany({
      orderBy: { createdAt: 'asc' },
      take: 300,
    });

    return messages.map((message) => this.toPublicMessage(message));
  }

  async findByOrder(orderId: string, actor?: ChatActor) {
    const normalizedOrderId = this.requireString(orderId, 'orderId obrigatorio');
    await this.assertOrderAccess(normalizedOrderId, actor);

    const messages = await this.prisma.chatMessage.findMany({
      where: { orderId: normalizedOrderId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((message) => this.toPublicMessage(message));
  }

  async sendMessage(data: any, actor?: ChatActor) {
    const orderId = this.requireString(data?.orderId, 'orderId obrigatorio');
    const senderId = this.readString(data?.senderId) ?? actor?.userId;
    const messageText = this.requireString(data?.message, 'mensagem obrigatoria');

    if (!senderId) {
      throw new BadRequestException('senderId obrigatorio');
    }

    await this.assertOrderAccess(orderId, actor ?? { userId: senderId });

    const message = await this.prisma.chatMessage.create({
      data: {
        orderId,
        senderId,
        senderRole: this.normalizeRole(data?.senderRole ?? actor?.role),
        message: messageText,
      },
    });

    const publicMessage = this.toPublicMessage(message);

    return publicMessage;
  }

  async markAsRead(messageId: string, actor?: ChatActor) {
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

    const publicMessage = this.toPublicMessage(message);

    return publicMessage;
  }

  async typing(data: any, actor?: ChatActor) {
    const orderId = this.requireString(data?.orderId, 'orderId obrigatorio');
    const senderId = this.readString(data?.senderId) ?? actor?.userId;

    if (!senderId) {
      throw new BadRequestException('senderId obrigatorio');
    }

    await this.assertOrderAccess(orderId, actor ?? { userId: senderId });

    const payload = {
      success: true,
      orderId,
      senderId,
      isTyping: data?.isTyping !== false,
      timestamp: new Date().toISOString(),
    };

    return payload;
  }

  async seedDemo(orderId: string, actor?: ChatActor) {
    const clientMessage = await this.sendMessage(
      {
        orderId,
        senderId: actor?.userId,
        senderRole: actor?.role ?? 'CLIENT',
        message: 'Ola, preciso que veja a tomada da sala.',
      },
      actor,
    );

    return {
      success: true,
      messages: [clientMessage],
    };
  }

  private async assertOrderAccess(orderId: string, actor?: ChatActor) {
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

  private assertOrderObjectAccess(order: any, actor?: ChatActor) {
    if (this.isAdmin(actor)) {
      return;
    }

    const userId = this.readString(actor?.userId);

    if (userId && (order.clientId === userId || order.professionalId === userId)) {
      return;
    }

    throw new ForbiddenException('Acesso negado ao chat desta ordem');
  }

  private toPublicMessage(message: any) {
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
      senderRole: message.senderRole,
      message: message.message,
      read: Boolean(message.readAt),
      createdAt,
      readAt: readAt ?? undefined,
      timestamp: createdAt,
    };
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

  private isAdmin(actor?: ChatActor) {
    return this.readString(actor?.role)?.toUpperCase() === 'ADMIN';
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private requireString(value: any, message: string) {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
  }
}
