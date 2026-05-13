Write-Host "========================================="
Write-Host "INSTALANDO NOTIFICATIONS SYSTEM"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$notifications = "$backend\src\notifications"

New-Item -ItemType Directory -Force -Path $notifications | Out-Null

@'
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
'@ | Set-Content "$notifications\notifications.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  findAll(): any {
    return this.notificationsService.findAll();
  }

  @Get(':userId')
  findByUser(@Param('userId') userId: string): any {
    return this.notificationsService.findByUser(userId);
  }

  @Post('send')
  send(@Body() body: any): any {
    return this.notificationsService.send(body);
  }

  @Post('broadcast')
  broadcast(@Body() body: any): any {
    return this.notificationsService.broadcast(body);
  }

  @Post('read/:id')
  markAsRead(@Param('id') id: string): any {
    return this.notificationsService.markAsRead(id);
  }
}
'@ | Set-Content "$notifications\notifications.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
'@ | Set-Content "$notifications\notifications.module.ts" -Encoding UTF8

$appModule = "$backend\src\app.module.ts"
$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "NotificationsModule") {

$appContent = $appContent -replace `
"import \{ AiModule \} from './ai/ai.module';",
"import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';"

$appContent = $appContent -replace `
"AiModule,",
"AiModule,
    NotificationsModule,"

Set-Content $appModule $appContent -Encoding UTF8
}

Write-Host "========================================="
Write-Host "NOTIFICATIONS SYSTEM INSTALADO"
Write-Host "========================================="