import { Controller, Post } from '@nestjs/common';

@Controller('sessions')
export class SessionsController {
  @Post('refresh')
  refresh() {
    return {
      success: true,
      refreshToken: 'refresh_token_mock',
      accessToken: 'access_token_mock',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('revoke')
  revoke() {
    return {
      success: true,
      revoked: true,
      timestamp: new Date().toISOString(),
    };
  }
}
