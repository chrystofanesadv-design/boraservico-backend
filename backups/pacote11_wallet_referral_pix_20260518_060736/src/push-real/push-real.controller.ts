import { Body, Controller, Get, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { readEnv } from '../config/env';
import { PushRealService } from './push-real.service';

@Controller('push-real')
export class PushRealController {
  constructor(private readonly pushRealService: PushRealService) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'push-real',
      firebaseAdminReady: Boolean(
        readEnv('FIREBASE_PROJECT_ID') &&
        readEnv('FIREBASE_CLIENT_EMAIL') &&
        readEnv('FIREBASE_PRIVATE_KEY'),
      ),
      realtimeReady: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  send(@Body() body: any) {
    return this.pushRealService.send(body);
  }
}
