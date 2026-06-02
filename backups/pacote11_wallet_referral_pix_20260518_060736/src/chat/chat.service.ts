import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type ChatSenderRole = 'CLIENT' | 'PROFESSIONAL' | 'SYSTEM';

interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  message: string;
  read: boolean;
  createdAt: Date;
  readAt?: Date;
}

@Injectable()
export class ChatService {
  private messages: ChatMessage[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      const messages = await this.prisma.chatMessage.findMany({
        orderBy: { createdAt: 'asc' },
        take: 300,
      });

      return messages.map((message) => this.toPublicMessage(message));
    } catch {
      return this.messages;
    }
  }

  async findByOrder(orderId: string) {
    try {
      const messages = await this.prisma.chatMessage.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });

      return messages.map((message) => this.toPublicMessage(message));
    } catch {
      return this.messages
        .filter((message) => message.orderId === orderId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
  }

  async sendMessage(data: any) {
    const persisted = await this.tryPersistMessage(data);

    if (persisted) {
      return persisted;
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      orderId: data?.orderId,
      senderId: data?.senderId ?? 'system',
      senderRole: data?.senderRole ?? 'SYSTEM',
      message: data?.message ?? '',
      read: false,
      createdAt: new Date(),
    };

    this.messages.push(message);

    return message;
  }

  async markAsRead(messageId: string) {
    try {
      const message = await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: { readAt: new Date() },
      });

      return this.toPublicMessage(message);
    } catch {
      const message = this.messages.find((item) => item.id === messageId);

      if (!message) {
        return {
          error: 'MESSAGE_NOT_FOUND',
          message: 'Mensagem nao encontrada',
        };
      }

      message.read = true;
      message.readAt = new Date();

      return message;
    }
  }

  async seedDemo(orderId: string) {
    const clientMessage = await this.sendMessage({
      orderId,
      senderId: 'cliente-1',
      senderRole: 'CLIENT',
      message: 'Ola, preciso que veja a tomada da sala.',
    });

    const professionalMessage = await this.sendMessage({
      orderId,
      senderId: 'profissional-1',
      senderRole: 'PROFESSIONAL',
      message: 'Tudo certo, estou a caminho.',
    });

    const systemMessage = await this.sendMessage({
      orderId,
      senderId: 'system',
      senderRole: 'SYSTEM',
      message: 'Profissional iniciou deslocamento.',
    });

    return {
      success: true,
      messages: [clientMessage, professionalMessage, systemMessage],
    };
  }

  private async tryPersistMessage(data: any) {
    const orderId = this.readString(data?.orderId);

    if (!orderId) {
      return null;
    }

    try {
      const message = await this.prisma.chatMessage.create({
        data: {
          orderId,
          senderId: this.readString(data?.senderId) ?? 'system',
          senderRole: this.normalizeRole(data?.senderRole),
          message: this.readString(data?.message) ?? '',
        },
      });

      return this.toPublicMessage(message);
    } catch {
      return null;
    }
  }

  private toPublicMessage(message: any) {
    return {
      id: message.id,
      orderId: message.orderId,
      senderId: message.senderId,
      senderRole: message.senderRole,
      message: message.message,
      read: Boolean(message.readAt),
      createdAt: message.createdAt,
      readAt: message.readAt ?? undefined,
    };
  }

  private normalizeRole(value: any) {
    const role = this.readString(value)?.toUpperCase();

    if (role === 'CLIENT' || role === 'PROFESSIONAL' || role === 'SYSTEM') {
      return role;
    }

    return 'SYSTEM';
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }
}
