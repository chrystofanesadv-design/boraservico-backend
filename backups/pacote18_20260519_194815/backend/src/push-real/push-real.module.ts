import { Global, Module } from '@nestjs/common';

import { PushRealController } from './push-real.controller';
import { PushRealService } from './push-real.service';

@Global()
@Module({
  controllers: [PushRealController],
  providers: [PushRealService],
  exports: [PushRealService],
})
export class PushRealModule {}
