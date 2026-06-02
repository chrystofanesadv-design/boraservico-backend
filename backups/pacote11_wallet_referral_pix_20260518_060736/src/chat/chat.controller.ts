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
