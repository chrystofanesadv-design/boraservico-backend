import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatService } from './chat.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { TypingDto } from './dto/typing.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  findAll(): any {
    return this.chatService.findAll();
  }

  @Get('order/:orderId')
  findByOrderCanonical(@Req() req: any, @Param('orderId') orderId: string): any {
    return this.chatService.findByOrder(orderId, req.user);
  }

  @Get(':orderId')
  findByOrder(@Req() req: any, @Param('orderId') orderId: string): any {
    return this.chatService.findByOrder(orderId, req.user);
  }

  @Post('message')
  async sendMessage(@Req() req: any, @Body() body: SendChatMessageDto) {
    const message = await this.chatService.sendMessage(
      {
        ...body,
        senderId: body.senderId ?? req.user?.userId,
        senderRole: body.senderRole ?? req.user?.role,
      },
      req.user,
    );

    RealtimeGateway.emitOperational('chat-message', message);

    return message;
  }

  @Post('typing')
  async typing(@Req() req: any, @Body() body: TypingDto) {
    const payload = await this.chatService.typing(
      {
        ...body,
        senderId: body.senderId ?? req.user?.userId,
      },
      req.user,
    );

    RealtimeGateway.emitOperational('typing', payload);

    return payload;
  }

  @Post('read/:messageId')
  async markAsRead(@Req() req: any, @Param('messageId') messageId: string) {
    const message = await this.chatService.markAsRead(messageId, req.user);

    RealtimeGateway.emitOperational('message-read', {
      orderId: message.orderId,
      messageId: message.id,
      readAt: message.readAt,
      readerId: req.user?.userId,
    });

    return message;
  }

  @Post(':messageId/read')
  markAsReadAlias(@Req() req: any, @Param('messageId') messageId: string): any {
    return this.markAsRead(req, messageId);
  }

  @Post('demo/:orderId')
  seedDemo(@Req() req: any, @Param('orderId') orderId: string): any {
    return this.chatService.seedDemo(orderId, req.user);
  }
}
