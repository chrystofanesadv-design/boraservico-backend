import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { TimelineService } from './timeline.service';

@Controller('timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  findAll(): any {
    return this.timelineService.findAll();
  }

  @Get(':orderId')
  findByOrder(@Param('orderId') orderId: string): any {
    return this.timelineService.findByOrder(orderId);
  }

  @Post('event')
  @UseGuards(JwtAuthGuard)
  createEvent(@Body() body: any): any {
    return this.timelineService.createEvent(body);
  }

  @Post('check-in')
  @UseGuards(JwtAuthGuard)
  checkIn(@Body() body: any): any {
    return this.timelineService.checkIn(body);
  }

  @Post('check-out')
  @UseGuards(JwtAuthGuard)
  checkOut(@Body() body: any): any {
    return this.timelineService.checkOut(body);
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard)
  complete(@Body() body: any): any {
    return this.timelineService.complete(body);
  }

  @Post('demo/:orderId')
  seedDemo(@Param('orderId') orderId: string): any {
    return this.timelineService.seedDemo(orderId);
  }
}
