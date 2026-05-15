import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [SecurityController],
  providers: [AuditService],
  exports: [AuditService],
})
export class SecurityModule {}
