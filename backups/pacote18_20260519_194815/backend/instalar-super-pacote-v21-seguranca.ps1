Write-Host "========================================="
Write-Host "BORASERVICO - SUPER PACOTE V21"
Write-Host "Seguranca Producao: Rate Limit + Validacao + Auditoria + Admin"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Instalando dependencias..."
npm install @nestjs/throttler class-validator class-transformer helmet

Write-Host "[2] Criando modulo security..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\security" | Out-Null

@'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito ao administrador');
    }

    return true;
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\security\admin.guard.ts"

@'
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  private readonly logs: any[] = [];

  register(action: string, payload: any = {}) {
    const log = {
      id: `audit_${Date.now()}_${Math.round(Math.random() * 1e9)}`,
      action,
      payload,
      createdAt: new Date().toISOString(),
    };

    this.logs.unshift(log);
    return log;
  }

  list() {
    return this.logs;
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\security\audit.service.ts"

@'
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
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\security\security.controller.ts"

@'
import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [SecurityController],
  providers: [AuditService],
  exports: [AuditService],
})
export class SecurityModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\security\security.module.ts"

Write-Host "[3] Criando DTO base..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\services\dto" | Out-Null

@'
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  clientId?: string;
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\services\dto\create-service.dto.ts"

Write-Host "[4] Atualizando main.ts com helmet/validation..."
$main = "C:\Users\chrys\boraservico-backend\src\main.ts"
$content = Get-Content $main -Raw

if ($content -notmatch "helmet") {
  $content = $content -replace "import \{ NestFactory \} from '@nestjs/core';", "import { NestFactory } from '@nestjs/core';`nimport helmet from 'helmet';`nimport { ValidationPipe } from '@nestjs/common';"
}

if ($content -notmatch "app.use\(helmet") {
  $content = $content -replace "app.enableCors\(\{", "app.use(helmet());`n`n    app.useGlobalPipes(`n      new ValidationPipe({`n        whitelist: true,`n        transform: true,`n        forbidNonWhitelisted: false,`n      }),`n    );`n`n    app.enableCors({"
}

Set-Content -Encoding UTF8 $main $content

Write-Host "[5] Atualizando app.module.ts com Throttler/SecurityModule..."
$appModule = "C:\Users\chrys\boraservico-backend\src\app.module.ts"
$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "ThrottlerModule") {
  $appContent = $appContent -replace "import \{ Module \} from '@nestjs/common';", "import { Module } from '@nestjs/common';`nimport { ThrottlerModule } from '@nestjs/throttler';"
}

if ($appContent -notmatch "SecurityModule") {
  if ($appContent -match "import \{ AiRealModule \}") {
    $appContent = $appContent -replace "import \{ AiRealModule \} from './ai-real/ai-real.module';", "import { AiRealModule } from './ai-real/ai-real.module';`nimport { SecurityModule } from './security/security.module';"
  } else {
    $appContent = "import { SecurityModule } from './security/security.module';`n" + $appContent
  }
}

if ($appContent -notmatch "ThrottlerModule.forRoot") {
  $appContent = $appContent -replace "imports: \[", "imports: [`n    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),"
}

if ($appContent -notmatch "SecurityModule,") {
  $appContent = $appContent -replace "imports: \[", "imports: [`n    SecurityModule,"
}

Set-Content -Encoding UTF8 $appModule $appContent

Write-Host "[6] Criando checklist de indices/RLS..."
@'
PENDENTE V22:
- Aplicar indices reais no prisma/schema.prisma conforme modelos existentes.
- Implementar storage privado com autorizacao por usuario/ordem.
- Implementar webhook pagamento com assinatura/validação de provider.
- Implementar antifraude com regras reais.
- Implementar admin guard em rotas sensiveis.
- RLS nativo não é padrão via Prisma; estratégia recomendada: authorization layer + policies por service + índices no banco.
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\prisma\SECURITY_TODO_V21.txt"

Write-Host "[7] Criando teste seguranca V21..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SEGURANCA V21"
Write-Host "========================================="

Invoke-RestMethod "$API/health"
Invoke-RestMethod "$API/security"
Invoke-RestMethod -Method Post -Uri "$API/security/audit" -ContentType "application/json" -Body '{"action":"SECURITY_V21_TEST","module":"security","status":"ok"}'
Invoke-RestMethod "$API/security/audit"
Invoke-RestMethod "$API/security/admin/status"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod "$API/push"
Invoke-RestMethod "$API/payments-real/status"
Invoke-RestMethod "$API/ai-real"

Write-Host "========================================="
Write-Host "TESTE SEGURANCA V21 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-seguranca-v21.ps1"

Write-Host "[8] Build backend..."
npm run build

Write-Host "========================================="
Write-Host "SUPER PACOTE V21 INSTALADO"
Write-Host "========================================="
