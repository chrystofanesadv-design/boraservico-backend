import { Injectable } from '@nestjs/common';

interface NotificationMock {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'ORDER' | 'PAYMENT' | 'DISPUTE' | 'REFERRAL' | 'SYSTEM';
  read: boolean;
  createdAt: Date;
  readAt?: Date;
}

@Injectable()
export class NotificationsService {
  private notifications: NotificationMock[] = [];

  send(data: any) {
    const notification: NotificationMock = {
      id: crypto.randomUUID(),
      userId: data?.userId ?? 'all',
      title: data?.title ?? 'Nova notificacao',
      message: data?.message ?? '',
      type: data?.type ?? 'SYSTEM',
      read: false,
      createdAt: new Date(),
    };

    this.notifications.push(notification);

    return {
      success: true,
      notification,
    };
  }

  broadcast(data: any) {
    const users: string[] = data?.users ?? [];

    const created = users.map((userId) => {
      const notification: NotificationMock = {
        id: crypto.randomUUID(),
        userId,
        title: data?.title ?? 'Comunicado BoraServico',
        message: data?.message ?? '',
        type: data?.type ?? 'SYSTEM',
        read: false,
        createdAt: new Date(),
      };

      this.notifications.push(notification);

      return notification;
    });

    return {
      success: true,
      total: created.length,
      notifications: created,
    };
  }

  findAll() {
    return this.notifications;
  }

  findByUser(userId: string) {
    return this.notifications.filter((item) => item.userId === userId);
  }

  markAsRead(id: string) {
    const notification = this.notifications.find((item) => item.id === id);

    if (!notification) {
      return {
        error: 'NOTIFICATION_NOT_FOUND',
        message: 'Notificacao nao encontrada',
      };
    }

    notification.read = true;
    notification.readAt = new Date();

    return notification;
  }
}
