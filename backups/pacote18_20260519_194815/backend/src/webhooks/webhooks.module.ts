import { Module } from '@nestjs/common';

import { PaymentsRealModule } from '../payments-real/payments-real.module';
import { PaymentsWebhookController } from './payments-webhook.controller';

@Module({
  imports: [PaymentsRealModule],
  controllers: [PaymentsWebhookController],
})
export class WebhooksModule {}
