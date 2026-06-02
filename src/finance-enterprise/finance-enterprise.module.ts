import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { FinanceEnterpriseController } from './finance-enterprise.controller';
import { FinanceEnterpriseService } from './finance-enterprise.service';

@Module({
  imports: [PaymentsModule, WalletModule],
  controllers: [FinanceEnterpriseController],
  providers: [FinanceEnterpriseService],
  exports: [FinanceEnterpriseService],
})
export class FinanceEnterpriseModule {}
