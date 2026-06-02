import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(): any {
    return this.paymentsService.findAll();
  }

  @Get('order/:orderId/status')
  getOrderStatus(@Param('orderId') orderId: string): any {
    return this.paymentsService.getOrderStatus(orderId);
  }

  @Get(':id/audit')
  @UseGuards(JwtAuthGuard)
  audit(@Param('id') id: string): any {
    return this.paymentsService.findPaymentAudits(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string): any {
    return this.paymentsService.findOne(id);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@Body() body: any): any {
    return this.paymentsService.createCheckout(body);
  }

  @Post('escrow')
  @UseGuards(JwtAuthGuard)
  escrow(@Body() body: any): any {
    return this.paymentsService.createEscrow(body);
  }

  @Post(':id/release')
  @UseGuards(JwtAuthGuard)
  release(@Param('id') id: string): any {
    return this.paymentsService.release(id);
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  refund(@Param('id') id: string, @Body() body: any): any {
    return this.paymentsService.refund(id, body);
  }

  @Post(':id/split')
  @UseGuards(JwtAuthGuard)
  split(@Param('id') id: string): any {
    return this.paymentsService.split(id);
  }
}
