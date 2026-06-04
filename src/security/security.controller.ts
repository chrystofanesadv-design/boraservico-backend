import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { getPublicEnvReadiness } from '../config/env';
import { AuditService } from './audit.service';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';

@Controller('security')
export class SecurityController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  status() {
    const env = getPublicEnvReadiness();

    return {
      success: true,
      module: 'security',
      productionReady: env.productionReady,
      env,
      features: {
        rateLimitReady: true,
        validationReady: true,
        auditReady: true,
        adminGuardReady: true,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('audit')
  auditLogs() {
    return this.auditService.list();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('audit')
  createAudit(@Body() body: any) {
    return this.auditService.register(body.action ?? 'MANUAL_AUDIT', body);
  }

  @Get('admin/status')
  adminStatus() {
    return {
      success: true,
      adminProtectedReady: true,
      message: 'Admin guard e auditoria persistente ativos.',
    };
  }
}
