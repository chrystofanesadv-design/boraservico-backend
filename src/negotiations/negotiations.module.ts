import { Module } from '@nestjs/common';

import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsService } from './negotiations.service';

@Module({
  imports: [MatchingModule, PaymentsModule],
  controllers: [NegotiationsController],
  providers: [NegotiationsService],
  exports: [NegotiationsService],
})
export class NegotiationsModule {}
