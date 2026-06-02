import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly authService: AuthService) {}

  @Post('refresh')
  refresh(@Body() body: any) {
    return this.authService.refresh(body?.refreshToken ?? body?.refresh_token);
  }

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  validate(@Req() req: any) {
    return {
      success: true,
      valid: true,
      user: req.user,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  revoke(@Req() req: any, @Body() body: any) {
    return this.authService.revoke(
      body?.refreshToken ?? body?.refresh_token,
      req.user,
    );
  }
}
