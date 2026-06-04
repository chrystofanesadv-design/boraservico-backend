import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  register(@Body() body: any) {
    return this.authService.register(body);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() body: any) {
    return this.authService.login(body.email, body.password);
  }
  @UseGuards(JwtAuthGuard)
  @Post('switch-environment')
  switchEnvironment(@Request() req: any, @Body() body: any) {
    return this.authService.switchEnvironment(req.user?.userId ?? req.user?.sub, body?.environment);
  }

  @Post('dev-seed')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  devSeed() {
    return this.authService.devSeed();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return {
      user: req.user,
    };
  }
}
