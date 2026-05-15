Write-Host "========================================="
Write-Host "BORASERVICO - SUPER PACOTE V23"
Write-Host "Registro de Modulos + Teste Final Backend"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

Write-Host "[1] Atualizando app.module.ts com modulos V22..."

$appModule = "C:\Users\chrys\boraservico-backend\src\app.module.ts"
$content = Get-Content $appModule -Raw

function Add-ImportIfMissing {
  param(
    [string]$Content,
    [string]$Token,
    [string]$ImportLine
  )

  if ($Content -notmatch [regex]::Escape($Token)) {
    $Content = $ImportLine + "`r`n" + $Content
  }

  return $Content
}

$content = Add-ImportIfMissing $content "FraudModule" "import { FraudModule } from './fraud/fraud.module';"
$content = Add-ImportIfMissing $content "WebhooksModule" "import { WebhooksModule } from './webhooks/webhooks.module';"
$content = Add-ImportIfMissing $content "PrivateStorageModule" "import { PrivateStorageModule } from './private-storage/private-storage.module';"
$content = Add-ImportIfMissing $content "SessionsModule" "import { SessionsModule } from './sessions/sessions.module';"

if ($content -notmatch "FraudModule,") {
  $content = $content -replace "imports: \[", "imports: [`r`n    FraudModule,`r`n    WebhooksModule,`r`n    PrivateStorageModule,`r`n    SessionsModule,"
}

Set-Content -Encoding UTF8 $appModule $content

Write-Host "[2] Criando modulo admin real-ready..."
New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\admin" | Out-Null

@'
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
})
export class AdminModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\admin\admin.module.ts"

@'
import { Body, Controller, Get, Post } from '@nestjs/common';

@Controller('admin')
export class AdminController {
  private actions: any[] = [];

  @Get()
  status() {
    return {
      success: true,
      module: 'admin',
      protectedByRoleReady: true,
      message: 'Admin real-ready. Proxima etapa: aplicar JwtGuard + AdminGuard em rotas sensiveis.',
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

  @Get('actions')
  list() {
    return this.actions;
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\admin\admin.controller.ts"

$content = Get-Content $appModule -Raw

if ($content -notmatch "AdminModule") {
  $content = "import { AdminModule } from './admin/admin.module';`r`n" + $content
}

if ($content -notmatch "AdminModule,") {
  $content = $content -replace "imports: \[", "imports: [`r`n    AdminModule,"
}

Set-Content -Encoding UTF8 $appModule $content

Write-Host "[3] Criando teste final backend V23..."
@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE FINAL BACKEND V23"
Write-Host "========================================="

Write-Host "[1] Core"
Invoke-RestMethod "$API/health"
Invoke-RestMethod "$API/observability/health"

Write-Host "[2] Security/Admin"
Invoke-RestMethod "$API/security"
Invoke-RestMethod -Method Post -Uri "$API/security/audit" -ContentType "application/json" -Body '{"action":"V23_TEST","status":"ok"}'
Invoke-RestMethod "$API/security/audit"
Invoke-RestMethod "$API/admin"
Invoke-RestMethod -Method Post -Uri "$API/admin/action" -ContentType "application/json" -Body '{"action":"CHECK_ADMIN_V23"}'
Invoke-RestMethod "$API/admin/actions"

Write-Host "[3] Sessions"
Invoke-RestMethod -Method Post -Uri "$API/sessions/refresh"
Invoke-RestMethod -Method Post -Uri "$API/sessions/revoke"

Write-Host "[4] Storage/Upload"
Invoke-RestMethod "$API/upload"
Invoke-RestMethod -Method Post -Uri "$API/upload/proof/mock" -ContentType "application/json" -Body '{"orderId":"ordem-v23","type":"CHECKOUT_PROOF","note":"Teste final V23"}'
Invoke-RestMethod "$API/upload/proofs"
Invoke-RestMethod "$API/private-storage/teste-v23.jpg"

Write-Host "[5] Webhook/Pagamentos"
Invoke-RestMethod "$API/payments-real/status"
Invoke-RestMethod -Method Post -Uri "$API/payments-real/checkout" -ContentType "application/json" -Body '{"provider":"mercado_pago","amount":350,"orderId":"ordem-v23"}'
Invoke-RestMethod -Method Post -Uri "$API/payments-webhook" -Headers @{"x-signature"="assinatura-v23"} -ContentType "application/json" -Body '{"event":"payment_approved","orderId":"ordem-v23"}'

Write-Host "[6] Fraud/AI"
Invoke-RestMethod -Method Post -Uri "$API/fraud/analyze" -ContentType "application/json" -Body '{"amount":350,"userId":"cliente-app","orderId":"ordem-v23"}'
Invoke-RestMethod "$API/ai-real"
Invoke-RestMethod -Method Post -Uri "$API/ai-real/price" -ContentType "application/json" -Body '{"category":"eletrica","urgent":true}'

Write-Host "[7] Push/Realtime"
Invoke-RestMethod "$API/push"
Invoke-RestMethod -Method Post -Uri "$API/push/token" -ContentType "application/json" -Body '{"userId":"cliente-app","token":"mock-token-v23"}'
Invoke-RestMethod -Method Post -Uri "$API/push/send" -ContentType "application/json" -Body '{"userId":"cliente-app","title":"V23","body":"Push test"}'
Invoke-RestMethod "$API/realtime"

Write-Host "[8] Marketplace"
Invoke-RestMethod "$API/services"
Invoke-RestMethod "$API/orders"
Invoke-RestMethod "$API/wallet"
Invoke-RestMethod "$API/matching/professionals"
Invoke-RestMethod "$API/disputes"
Invoke-RestMethod "$API/reputation"
Invoke-RestMethod "$API/referral"
Invoke-RestMethod "$API/tracking"
Invoke-RestMethod "$API/timeline"
Invoke-RestMethod "$API/chat"
Invoke-RestMethod "$API/notifications"

Write-Host "========================================="
Write-Host "TESTE FINAL BACKEND V23 CONCLUIDO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-final-backend-v23.ps1"

Write-Host "[4] Criando checklist final..."
@'
STATUS V23:
- Modulos V22 registrados no app.module.ts
- Admin real-ready criado
- Teste final backend V23 criado

PENDENTE APOS V23:
- Aplicar JwtGuard + AdminGuard nas rotas admin/sensiveis
- Aplicar indices reais no Prisma schema após validação visual do schema
- Substituir mocks por credenciais reais: Firebase Admin, Mercado Pago/Pagar.me, Gemini/OpenAI
- Ligar 100% das telas Flutter premium aos services reais
- Build final APK/AAB somente depois dos testes consolidados
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\STATUS_V23.txt"

Write-Host "[5] Build backend..."
npm run build

Write-Host "========================================="
Write-Host "SUPER PACOTE V23 INSTALADO"
Write-Host "========================================="
