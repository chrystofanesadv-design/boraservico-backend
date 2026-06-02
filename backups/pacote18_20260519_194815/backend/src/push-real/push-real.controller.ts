import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { SendPushDto } from './dto/send-push.dto';
import { PushRealService } from './push-real.service';

@Controller('push-real')
export class PushRealController {
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
  registerToken(@Req() req: any, @Body() body: RegisterPushTokenDto) {
    return this.pushRealService.registerToken(
      body.userId ?? req.user?.userId,
      body.token,
      {
        source: 'push-real/token',
        platform: body.platform,
        deviceId: body.deviceId,
      },
    );
  }

  @Post('register-token')
  @UseGuards(JwtAuthGuard)
  registerTokenAlias(@Req() req: any, @Body() body: RegisterPushTokenDto) {
    return this.registerToken(req, body);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  send(@Body() body: SendPushDto) {
    return this.pushRealService.send(body);
  }
}
