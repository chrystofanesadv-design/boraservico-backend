import { Injectable } from '@nestjs/common';

type ChatSenderRole =
  | 'CLIENT'
  | 'PROFESSIONAL'
  | 'SYSTEM';

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

  findAll() {
    return this.messages;
  }

  findByOrder(orderId: string) {
    return this.messages
      .filter((message) => message.orderId === orderId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  sendMessage(data: any) {
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

  markAsRead(messageId: string) {
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

  seedDemo(orderId: string) {
    const clientMessage = this.sendMessage({
      orderId,
      senderId: 'cliente-1',
      senderRole: 'CLIENT',
      message: 'OlÃ¡, preciso que veja a tomada da sala.',
    });

    const professionalMessage = this.sendMessage({
      orderId,
      senderId: 'profissional-1',
      senderRole: 'PROFESSIONAL',
      message: 'Tudo certo, estou a caminho.',
    });

    const systemMessage = this.sendMessage({
      orderId,
      senderId: 'system',
      senderRole: 'SYSTEM',
      message: 'Profissional iniciou deslocamento.',
    });

    return {
      success: true,
      messages: [
        clientMessage,
        professionalMessage,
        systemMessage,
      ],
    };
  }
}
