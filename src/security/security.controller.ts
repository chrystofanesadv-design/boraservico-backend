import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  status() {
    return {
      success: true,
      module: 'security',
      features: {
        rateLimitReady: true,
        validationReady: true,
        auditReady: true,
        adminGuardReady: true,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('audit')
  auditLogs() {
    return this.auditService.list();
  }

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
