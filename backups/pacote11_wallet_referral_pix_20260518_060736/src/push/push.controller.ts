import { Body, Controller, Get, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { readEnv } from '../config/env';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'push',
      firebaseAdminReady: Boolean(
        readEnv('FIREBASE_PROJECT_ID') &&
        readEnv('FIREBASE_CLIENT_EMAIL') &&
        readEnv('FIREBASE_PRIVATE_KEY'),
      ),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  tokens() {
    return this.pushService.listTokens();
  }

  @Post('token')
  saveToken(@Body() body: any) {
    return this.pushService.saveToken(
      body.userId ?? 'cliente-app',
      body.token ?? 'mock-token',
    );
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async send(@Body() body: any) {
    return this.pushService.sendToUser(
      body.userId ?? 'cliente-app',
      body.title ?? 'BoraServiÃ§o',
      body.body ?? body.message ?? 'NotificaÃ§Ã£o BoraServiÃ§o',
      body.data ?? {},
    );
  }

  @Post('send-token')
  @UseGuards(JwtAuthGuard)
  async sendToken(@Body() body: any) {
    return this.pushService.sendToToken(
      body.token ?? 'mock-token',
      body.title ?? 'BoraServiÃ§o',
      body.body ?? body.message ?? 'NotificaÃ§Ã£o BoraServiÃ§o',
      body.data ?? {},
    );
  }
}
