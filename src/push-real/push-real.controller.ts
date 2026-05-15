import { Body, Controller, Get, Post } from '@nestjs/common';
import { PushRealService } from './push-real.service';

@Controller('push-real')
export class PushRealController {
  constructor(private readonly pushRealService: PushRealService) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'push-real',
      firebaseAdminReady: true,
      realtimeReady: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('send')
  send(@Body() body: any) {
    return this.pushRealService.send(body);
  }
}
