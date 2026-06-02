import { Module } from '@nestjs/common';

import { FraudModule } from '../fraud/fraud.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [FraudModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
