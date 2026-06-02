Write-Host "========================================="
Write-Host "INSTALANDO CHAT SYSTEM"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$chat = "$backend\src\chat"

New-Item -ItemType Directory -Force -Path $chat | Out-Null

@'
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
      message: 'Olá, preciso que veja a tomada da sala.',
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
'@ | Set-Content "$chat\chat.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
  ) {}

  @Get()
  findAll(): any {
    return this.chatService.findAll();
  }

  @Get(':orderId')
  findByOrder(@Param('orderId') orderId: string): any {
    return this.chatService.findByOrder(orderId);
  }

  @Post('message')
  sendMessage(@Body() body: any): any {
    return this.chatService.sendMessage(body);
  }

  @Post('read/:messageId')
  markAsRead(@Param('messageId') messageId: string): any {
    return this.chatService.markAsRead(messageId);
  }

  @Post('demo/:orderId')
  seedDemo(@Param('orderId') orderId: string): any {
    return this.chatService.seedDemo(orderId);
  }
}
'@ | Set-Content "$chat\chat.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
'@ | Set-Content "$chat\chat.module.ts" -Encoding UTF8

$appModule = "$backend\src\app.module.ts"
$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "ChatModule") {

$appContent = $appContent -replace `
"import \{ TimelineModule \} from './timeline/timeline.module';",
"import { TimelineModule } from './timeline/timeline.module';
import { ChatModule } from './chat/chat.module';"

$appContent = $appContent -replace `
"TimelineModule,",
"TimelineModule,
    ChatModule,"

Set-Content $appModule $appContent -Encoding UTF8
}

Write-Host "========================================="
Write-Host "CHAT SYSTEM INSTALADO"
Write-Host "========================================="