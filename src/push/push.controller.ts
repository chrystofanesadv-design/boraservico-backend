import { Body, Controller, Get, Post } from '@nestjs/common';
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
        process.env.FIREBASE_PROJECT_ID &&
          process.env.FIREBASE_CLIENT_EMAIL &&
          process.env.FIREBASE_PRIVATE_KEY,
      ),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tokens')
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
  async send(@Body() body: any) {
    return this.pushService.sendToUser(
      body.userId ?? 'cliente-app',
      body.title ?? 'BoraServiÃ§o',
      body.body ?? body.message ?? 'NotificaÃ§Ã£o BoraServiÃ§o',
      body.data ?? {},
    );
  }

  @Post('send-token')
  async sendToken(@Body() body: any) {
    return this.pushService.sendToToken(
      body.token ?? 'mock-token',
      body.title ?? 'BoraServiÃ§o',
      body.body ?? body.message ?? 'NotificaÃ§Ã£o BoraServiÃ§o',
      body.data ?? {},
    );
  }
}
