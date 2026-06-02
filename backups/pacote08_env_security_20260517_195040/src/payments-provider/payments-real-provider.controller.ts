import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsRealProviderService } from './payments-real-provider.service';

@Controller('payments-provider')
export class PaymentsRealProviderController {
  constructor(private readonly service: PaymentsRealProviderService) {}

  @Post('checkout')
  checkout(@Body() body: any) {
    return this.service.checkout(body);
  }
}
