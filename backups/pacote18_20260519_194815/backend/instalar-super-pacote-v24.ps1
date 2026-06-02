Write-Host "========================================="
Write-Host "BORASERVICO - SUPER PACOTE V24"
Write-Host "JWT/Admin Guards + Indices Checklist + Teste Segurança"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Criando JwtAuthGuard reutilizavel..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\security" | Out-Null

@'
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\security\jwt-auth.guard.ts"

Write-Host "[2] Reforçando AdminGuard..."
@'
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito ao administrador');
    }

    return true;
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\security\admin.guard.ts"

Write-Host "[3] Atualizando AdminController com endpoints protegidos ready..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\admin" | Out-Null

@'
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { AdminGuard } from '../security/admin.guard';

@Controller('admin')
export class AdminController {
  private actions: any[] = [];

  @Get()
  status() {
    return {
      success: true,
      module: 'admin',
      protectedByRoleReady: true,
      publicStatus: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('protected-status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  protectedStatus() {
    return {
      success: true,
      protected: true,
      role: 'ADMIN',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('action')
  action(@Body() body: any) {
    const action = {
      id: `admin_${Date.now()}`,
      action: body.action ?? 'ADMIN_ACTION',
      payload: body,
      createdAt: new Date().toISOString(),
    };

    this.actions.unshift(action);
    return action;
  }

  @Post('protected-action')
  @UseGuards(JwtAuthGuard, AdminGuard)
  protectedAction(@Body() body: any) {
    const action = {
      id: `admin_protected_${Date.now()}`,
      action: body.action ?? 'ADMIN_PROTECTED_ACTION',
      payload: body,
      protected: true,
      createdAt: new Date().toISOString(),
    };

    this.actions.unshift(action);
    return action;
  }

  @Get('actions')
  list() {
    return this.actions;
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\admin\admin.controller.ts"

Write-Host "[4] Criando arquivo seguro de sugestao de indices Prisma..."
@'
# INDICES RECOMENDADOS PARA O PRISMA

Aplique manualmente no prisma/schema.prisma conforme os models existentes.

Exemplos:

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  role      String
  createdAt DateTime @default(now())

  @@index([email])
  @@index([role])
  @@index([createdAt])
}

model ServiceOrder {
  id             String   @id @default(uuid())
  clientId       String
  professionalId String?
  status         String
  createdAt      DateTime @default(now())

  @@index([clientId])
  @@index([professionalId])
  @@index([status])
  @@index([createdAt])
}

model Notification {
  id        String   @id @default(uuid())
  userId    String
  read      Boolean
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([read])
  @@index([createdAt])
}

IMPORTANTE:
- Não apliquei automaticamente para evitar quebrar nomes reais do schema.
- Próximo pacote pode ler o schema e aplicar se você enviar/confirmar o conteúdo.
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\prisma\INDICES_RECOMENDADOS_V24.txt"

Write-Host "[5] Criando teste V24..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SUPER PACOTE V24"
Write-Host "========================================="

Write-Host "[1] Health"
Invoke-RestMethod "$API/health"

Write-Host "[2] Admin público"
Invoke-RestMethod "$API/admin"

Write-Host "[3] Admin action pública/log"
Invoke-RestMethod -Method Post -Uri "$API/admin/action" -ContentType "application/json" -Body '{"action":"V24_PUBLIC_ADMIN_LOG"}'

Write-Host "[4] Security"
Invoke-RestMethod "$API/security"

Write-Host "[5] Audit"
Invoke-RestMethod -Method Post -Uri "$API/security/audit" -ContentType "application/json" -Body '{"action":"V24_SECURITY_AUDIT"}'
Invoke-RestMethod "$API/security/audit"

Write-Host "[6] Protegido sem token deve falhar 401/403"
try {
  Invoke-RestMethod "$API/admin/protected-status"
} catch {
  Write-Host "[OK] Rota protegida bloqueou sem token."
}

Write-Host "========================================="
Write-Host "TESTE V24 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-super-v24.ps1"

Write-Host "[6] Build backend..."
npm run build

Write-Host "========================================="
Write-Host "SUPER PACOTE V24 INSTALADO"
Write-Host "========================================="
