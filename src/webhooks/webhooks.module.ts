import { Module } from '@nestjs/common';
import { PaymentsWebhookController } from './payments-webhook.controller';

@Module({
  controllers: [PaymentsWebhookController],
})
export class WebhooksModule {}
