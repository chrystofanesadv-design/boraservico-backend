import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.trackingService.findAll();
  }

  @Get(':orderId')
  @UseGuards(JwtAuthGuard)
  findByOrder(@Param('orderId') orderId: string) {
    return this.trackingService.findByOrder(orderId);
  }

  @Post('check-in')
  @UseGuards(JwtAuthGuard)
  checkIn(@Body() body: any) {
    return this.trackingService.checkIn(body);
  }

  @Post('start-displacement')
  @UseGuards(JwtAuthGuard)
  startDisplacement(@Body() body: any) {
    return this.trackingService.startDisplacement(body);
  }

  @Post('location')
  @UseGuards(JwtAuthGuard)
  location(@Body() body: any) {
    return this.trackingService.location(body);
  }

  @Post('route')
  @UseGuards(JwtAuthGuard)
  route(@Body() body: any) {
    return this.trackingService.route(body);
  }

  @Post('check-out')
  @UseGuards(JwtAuthGuard)
  checkOut(@Body() body: any) {
    return this.trackingService.checkOut(body);
  }
}
