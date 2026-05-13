import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
  ) {}

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
  accept(
    @Param('id') id: string,
    @Body() body: any,
  ): any {
    return this.ordersService.accept(
      id,
      body?.professionalId,
    );
  }

  @Post(':id/start')
  start(@Param('id') id: string): any {
    return this.ordersService.start(id);
  }

  @Post(':id/check-in')
  checkIn(@Param('id') id: string): any {
    return this.ordersService.checkIn(id);
  }

  @Post(':id/check-out')
  checkOut(@Param('id') id: string): any {
    return this.ordersService.checkOut(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string): any {
    return this.ordersService.complete(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string): any {
    return this.ordersService.cancel(id);
  }
}