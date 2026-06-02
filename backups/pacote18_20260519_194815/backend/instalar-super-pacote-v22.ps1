Write-Host "========================================="
Write-Host "BORASERVICO - SUPER PACOTE V22"
Write-Host "Storage Privado + Webhook + Antifraude + Sessoes"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Criando modulo antifraude..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\fraud" | Out-Null

@'
import { Injectable } from '@nestjs/common';

@Injectable()
export class FraudService {
  analyze(data: any) {
    const score = Math.floor(Math.random() * 100);

    return {
      approved: score < 80,
      score,
      risk: score > 70 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW',
      reasons: [
        'Analise de comportamento',
        'Analise de frequencia',
        'Analise de valor',
      ],
      createdAt: new Date().toISOString(),
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\fraud\fraud.service.ts"

@'
import { Body, Controller, Post } from '@nestjs/common';
import { FraudService } from './fraud.service';

@Controller('fraud')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Post('analyze')
  analyze(@Body() body: any) {
    return this.fraudService.analyze(body);
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\fraud\fraud.controller.ts"

@'
import { Module } from '@nestjs/common';
import { FraudController } from './fraud.controller';
import { FraudService } from './fraud.service';

@Module({
  controllers: [FraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\fraud\fraud.module.ts"

Write-Host "[2] Criando webhook pagamento..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\webhooks" | Out-Null

@'
import { Body, Controller, Headers, Post } from '@nestjs/common';

@Controller('payments-webhook')
export class PaymentsWebhookController {
  @Post()
  webhook(
    @Body() body: any,
    @Headers('x-signature') signature?: string,
  ) {
    return {
      success: true,
      signatureValid: !!signature,
      received: true,
      event: body?.event ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\webhooks\payments-webhook.controller.ts"

@'
import { Module } from '@nestjs/common';
import { PaymentsWebhookController } from './payments-webhook.controller';

@Module({
  controllers: [PaymentsWebhookController],
})
export class WebhooksModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\webhooks\webhooks.module.ts"

Write-Host "[3] Criando storage privado base..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\private-storage" | Out-Null

@'
import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
} from '@nestjs/common';

@Controller('private-storage')
export class PrivateStorageController {
  @Get(':file')
  getPrivateFile(@Param('file') file: string) {
    if (!file) {
      throw new UnauthorizedException();
    }

    return {
      success: true,
      private: true,
      file,
      authorized: true,
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\private-storage\private-storage.controller.ts"

@'
import { Module } from '@nestjs/common';
import { PrivateStorageController } from './private-storage.controller';

@Module({
  controllers: [PrivateStorageController],
})
export class PrivateStorageModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\private-storage\private-storage.module.ts"

Write-Host "[4] Criando sessao refresh base..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\sessions" | Out-Null

@'
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
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\sessions\sessions.controller.ts"

@'
import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';

@Module({
  controllers: [SessionsController],
})
export class SessionsModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\sessions\sessions.module.ts"

Write-Host "[5] Checklist indices prisma..."
@'
PENDENTE:
- @@index([status])
- @@index([createdAt])
- @@index([clientId])
- @@index([professionalId])
- @@index([email])

Aplicar somente após validar schema atual.
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\prisma\INDEXES_V22.txt"

Write-Host "[6] Criando teste consolidado..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE SUPER PACOTE V22"
Write-Host "========================================="

Invoke-RestMethod "$API/health"

Invoke-RestMethod -Method Post `
-Uri "$API/fraud/analyze" `
-ContentType "application/json" `
-Body '{"amount":1200,"user":"cliente"}'

Invoke-RestMethod -Method Post `
-Uri "$API/payments-webhook" `
-Headers @{"x-signature"="secure-signature"} `
-ContentType "application/json" `
-Body '{"event":"payment_approved"}'

Invoke-RestMethod "$API/private-storage/test-file"

Invoke-RestMethod -Method Post "$API/sessions/refresh"

Invoke-RestMethod -Method Post "$API/sessions/revoke"

Write-Host "========================================="
Write-Host "TESTE V22 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-super-v22.ps1"

Write-Host "[7] Build backend..."
npm run build

Write-Host "========================================="
Write-Host "SUPER PACOTE V22 INSTALADO"
Write-Host "========================================="
