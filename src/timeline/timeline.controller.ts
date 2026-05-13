import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { TimelineService } from './timeline.service';

@Controller('timeline')
export class TimelineController {
  constructor(
    private readonly timelineService: TimelineService,
  ) {}

  @Get()
  findAll(): any {
    return this.timelineService.findAll();
  }

  @Get(':orderId')
  findByOrder(@Param('orderId') orderId: string): any {
    return this.timelineService.findByOrder(orderId);
  }

  @Post('event')
  createEvent(@Body() body: any): any {
    return this.timelineService.createEvent(body);
  }

  @Post('check-in')
  checkIn(@Body() body: any): any {
    return this.timelineService.checkIn(body);
  }

  @Post('check-out')
  checkOut(@Body() body: any): any {
    return this.timelineService.checkOut(body);
  }

  @Post('complete')
  complete(@Body() body: any): any {
    return this.timelineService.complete(body);
  }

  @Post('demo/:orderId')
  seedDemo(@Param('orderId') orderId: string): any {
    return this.timelineService.seedDemo(orderId);
  }
}
