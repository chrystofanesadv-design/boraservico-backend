import { Body, Controller, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { PaymentsRealProviderService } from './payments-real-provider.service';

@Controller('payments-provider')
export class PaymentsRealProviderController {
  constructor(private readonly service: PaymentsRealProviderService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@Body() body: any) {
    return this.service.checkout(body);
  }
}
