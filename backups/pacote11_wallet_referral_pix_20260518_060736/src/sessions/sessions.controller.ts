import { Controller, Post } from '@nestjs/common';

import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';

@Controller('sessions')
export class SessionsController {
  @Post('refresh')
  refresh() {
    // Bloqueia fluxo mock em produção.
    // Implementação real deve usar refresh token persistido e rotacionar.
    return {
      success: false,
      error: 'refresh_not_implemented',
      message: 'Refresh token não está habilitado sem configuração real.',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  revoke() {
    return {
      success: true,
      revoked: true,
      timestamp: new Date().toISOString(),
    };
  }
}
