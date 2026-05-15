import { Module } from '@nestjs/common';
import { PushRealController } from './push-real.controller';
import { PushRealService } from './push-real.service';

@Module({
  controllers: [PushRealController],
  providers: [PushRealService],
})
export class PushRealModule {}
