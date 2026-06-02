import { Global, Module } from '@nestjs/common';

import { AdminGuard } from './admin.guard';
import { AuditService } from './audit.service';
import { RolesGuard } from './roles.guard';
import { SecurityController } from './security.controller';

@Global()
@Module({
  controllers: [SecurityController],
  providers: [AuditService, AdminGuard, RolesGuard],
  exports: [AuditService, AdminGuard, RolesGuard],
})
export class SecurityModule {}
