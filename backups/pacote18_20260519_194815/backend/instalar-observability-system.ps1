Write-Host "========================================="
Write-Host "INSTALANDO OBSERVABILITY + AUTORECOVERY"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$observability = "$backend\src\observability"

New-Item -ItemType Directory -Force -Path $observability | Out-Null

@'
import { Injectable } from '@nestjs/common';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogMock {
  id: string;
  level: LogLevel;
  context: string;
  message: string;
  metadata?: any;
  createdAt: Date;
}

interface ErrorMock {
  id: string;
  context: string;
  message: string;
  stack?: string;
  recovered: boolean;
  createdAt: Date;
  recoveredAt?: Date;
}

@Injectable()
export class ObservabilityService {
  private logs: LogMock[] = [];
  private errors: ErrorMock[] = [];

  health() {
    return {
      status: 'ok',
      service: 'BoraServico Backend',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date(),
      modules: {
        auth: 'ok',
        services: 'ok',
        orders: 'ok',
        wallet: 'ok',
        matching: 'ok',
        disputes: 'ok',
        tracking: 'ok',
        ai: 'ok',
        notifications: 'ok',
        referral: 'ok',
        reputation: 'ok',
      },
    };
  }

  log(data: any) {
    const log: LogMock = {
      id: crypto.randomUUID(),
      level: data?.level ?? 'INFO',
      context: data?.context ?? 'SYSTEM',
      message: data?.message ?? '',
      metadata: data?.metadata,
      createdAt: new Date(),
    };

    this.logs.push(log);

    return log;
  }

  error(data: any) {
    const error: ErrorMock = {
      id: crypto.randomUUID(),
      context: data?.context ?? 'SYSTEM',
      message: data?.message ?? '',
      stack: data?.stack,
      recovered: false,
      createdAt: new Date(),
    };

    this.errors.push(error);

    return error;
  }

  autoRecovery(data: any) {
    const error = this.errors.find((item) => item.id === data?.errorId);

    if (!error) {
      return {
        error: 'ERROR_NOT_FOUND',
        message: 'Erro nao encontrado',
      };
    }

    error.recovered = true;
    error.recoveredAt = new Date();

    const log = this.log({
      level: 'INFO',
      context: 'AUTO_RECOVERY',
      message: `Auto recovery aplicado no erro ${error.id}`,
      metadata: {
        errorId: error.id,
        strategy: data?.strategy ?? 'fallback',
      },
    });

    return {
      success: true,
      recoveredError: error,
      recoveryLog: log,
    };
  }

  findLogs() {
    return this.logs;
  }

  findErrors() {
    return this.errors;
  }
}
'@ | Set-Content "$observability\observability.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';

import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
  ) {}

  @Get('health')
  health(): any {
    return this.observabilityService.health();
  }

  @Get('logs')
  logs(): any {
    return this.observabilityService.findLogs();
  }

  @Post('log')
  log(@Body() body: any): any {
    return this.observabilityService.log(body);
  }

  @Get('errors')
  errors(): any {
    return this.observabilityService.findErrors();
  }

  @Post('error')
  error(@Body() body: any): any {
    return this.observabilityService.error(body);
  }

  @Post('autorecovery')
  autoRecovery(@Body() body: any): any {
    return this.observabilityService.autoRecovery(body);
  }
}
'@ | Set-Content "$observability\observability.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';

@Module({
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
'@ | Set-Content "$observability\observability.module.ts" -Encoding UTF8

$appModule = "$backend\src\app.module.ts"
$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "ObservabilityModule") {

$appContent = $appContent -replace `
"import \{ NotificationsModule \} from './notifications/notifications.module';",
"import { NotificationsModule } from './notifications/notifications.module';
import { ObservabilityModule } from './observability/observability.module';"

$appContent = $appContent -replace `
"NotificationsModule,",
"NotificationsModule,
    ObservabilityModule,"

Set-Content $appModule $appContent -Encoding UTF8
}

Write-Host "========================================="
Write-Host "OBSERVABILITY + AUTORECOVERY INSTALADO"
Write-Host "========================================="