import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get()
  findAll(): any {
    return this.trackingService.findAll();
  }

  @Get(':orderId')
  findByOrder(@Param('orderId') orderId: string): any {
    return this.trackingService.findByOrder(orderId);
  }

  @Post('check-in')
  @UseGuards(JwtAuthGuard)
  checkIn(@Body() body: any): any {
    return this.trackingService.checkIn(body);
  }

  @Post('location')
  @UseGuards(JwtAuthGuard)
  location(@Body() body: any): any {
    return this.trackingService.location(body);
  }

  @Post('check-out')
  @UseGuards(JwtAuthGuard)
  checkOut(@Body() body: any): any {
    return this.trackingService.checkOut(body);
  }
}
