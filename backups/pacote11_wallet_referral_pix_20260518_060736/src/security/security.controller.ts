import { Body, Controller, Get, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { getPublicEnvReadiness } from '../config/env';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from './jwt-auth.guard';

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

  @UseGuards(JwtAuthGuard)
  @Get('audit')
  auditLogs() {
    return this.auditService.list();
  }

  @UseGuards(JwtAuthGuard)
  @Post('audit')
  createAudit(@Body() body: any) {
    return this.auditService.register(body.action ?? 'MANUAL_AUDIT', body);
  }

  @Get('admin/status')
  adminStatus() {
    return {
      success: true,
      adminProtectedReady: true,
      message: 'Admin guard criado. Proxima etapa: aplicar em rotas sensiveis.',
    };
  }
}
