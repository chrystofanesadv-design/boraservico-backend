import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly trackingService: TrackingService,
  ) {}

  @Get()
  findAll(): any {
    return this.trackingService.findAll();
  }

  @Get(':orderId')
  findByOrder(
    @Param('orderId') orderId: string,
  ): any {
    return this.trackingService.findByOrder(orderId);
  }

  @Post('check-in')
  checkIn(@Body() body: any): any {
    return this.trackingService.checkIn(body);
  }

  @Post('location')
  location(@Body() body: any): any {
    return this.trackingService.location(body);
  }

  @Post('check-out')
  checkOut(@Body() body: any): any {
    return this.trackingService.checkOut(body);
  }
}
