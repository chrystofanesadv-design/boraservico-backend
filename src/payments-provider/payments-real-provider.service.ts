import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentsRealProviderService {
  async checkout(data: any) {
    return {
      success: true,
      provider: 'mercado-pago-ready',
      checkoutId: `checkout_${Date.now()}`,
      amount: data.amount,
      status: 'PENDING',
      timestamp: new Date().toISOString(),
    };
  }
}
