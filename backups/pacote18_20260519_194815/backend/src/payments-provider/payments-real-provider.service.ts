import { Injectable } from '@nestjs/common';

import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class PaymentsRealProviderService {
  constructor(private readonly paymentsService: PaymentsService) {}

  checkout(data: any) {
    return this.paymentsService.createCheckout(data);
  }
}
