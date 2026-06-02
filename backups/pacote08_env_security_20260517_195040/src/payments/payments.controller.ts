import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get()
  findAll(): any {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): any {
    return this.paymentsService.findOne(id);
  }

  @Post('escrow')
  escrow(@Body() body: any): any {
    return this.paymentsService.createEscrow(body);
  }

  @Post(':id/release')
  release(@Param('id') id: string): any {
    return this.paymentsService.release(id);
  }

  @Post(':id/refund')
  refund(
    @Param('id') id: string,
    @Body() body: any,
  ): any {
    return this.paymentsService.refund(id, body);
  }

  @Post(':id/split')
  split(@Param('id') id: string): any {
    return this.paymentsService.split(id);
  }
}
