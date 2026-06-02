import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() body: any): any {
    return this.ordersService.create(body);
  }

  @Get()
  findAll(): any {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): any {
    return this.ordersService.findOne(id);
  }

  @Post(':id/accept')
  @UseGuards(JwtAuthGuard)
  accept(@Param('id') id: string, @Body() body: any): any {
    return this.ordersService.accept(id, body?.professionalId);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  start(@Param('id') id: string): any {
    return this.ordersService.start(id);
  }

  @Post(':id/check-in')
  @UseGuards(JwtAuthGuard)
  checkIn(@Param('id') id: string): any {
    return this.ordersService.checkIn(id);
  }

  @Post(':id/check-out')
  @UseGuards(JwtAuthGuard)
  checkOut(@Param('id') id: string): any {
    return this.ordersService.checkOut(id);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  complete(@Param('id') id: string): any {
    return this.ordersService.complete(id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Param('id') id: string): any {
    return this.ordersService.cancel(id);
  }
}
