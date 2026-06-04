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
