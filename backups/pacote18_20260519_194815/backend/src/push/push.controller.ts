import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RegisterPushTokenDto } from '../push-real/dto/register-push-token.dto';
import { SendPushDto } from '../push-real/dto/send-push.dto';
import { PushRealService } from '../push-real/push-real.service';

@Controller('push')
export class PushController {
  constructor(private readonly pushRealService: PushRealService) {}

  @Get()
  status() {
    return this.pushRealService.status();
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  tokens() {
    return this.pushRealService.listRegisteredTokens();
  }

  @Post('token')
  @UseGuards(JwtAuthGuard)
  saveToken(@Req() req: any, @Body() body: RegisterPushTokenDto) {
    return this.pushRealService.registerToken(
      body.userId ?? req.user?.userId,
      body.token,
      {
        source: 'push/token',
        platform: body.platform,
        deviceId: body.deviceId,
      },
    );
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async send(@Body() body: SendPushDto) {
    return this.pushRealService.send(body);
  }

  @Post('send-token')
  @UseGuards(JwtAuthGuard)
  async sendToken(@Body() body: any) {
    return this.pushRealService.sendToToken(
      body.token,
      {
        title: body.title ?? 'BoraServico',
        body: body.body ?? body.message ?? 'Notificacao BoraServico',
        data: body.data ?? {},
      },
      {
        source: 'push/send-token',
      },
    );
  }
}
