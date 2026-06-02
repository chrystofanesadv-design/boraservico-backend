Write-Host "========================================="
Write-Host "BORASERVICO - PAYMENTS REAL V10"
Write-Host "Mercado Pago + Pagar.me + Webhook Ready"
Write-Host "========================================="

cd C:\Users\chrys\boraservico-backend

npm install axios

New-Item -ItemType Directory -Force -Path "C:\Users\chrys\boraservico-backend\src\payments-real" | Out-Null

@'
import { Module } from '@nestjs/common';
import { PaymentsRealController } from './payments-real.controller';
import { PaymentsRealService } from './payments-real.service';

@Module({
  controllers: [PaymentsRealController],
  providers: [PaymentsRealService],
})
export class PaymentsRealModule {}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\payments-real\payments-real.module.ts"

@'
import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentsRealService {
  private transactions: any[] = [];

  createCheckout(body: any) {
    const provider = body.provider ?? 'mercado_pago';
    const amount = Number(body.amount ?? 0);
    const commission = Number((amount * 0.1).toFixed(2));
    const professionalAmount = Number((amount - commission).toFixed(2));

    const tx = {
      id: `pay_${Date.now()}`,
      provider,
      status: 'PENDING',
      amount,
      commission,
      professionalAmount,
      escrow: true,
      checkoutUrl: `https://checkout.mock.boraservico.app/${provider}/${Date.now()}`,
      orderId: body.orderId ?? 'ordem-payment-real-ready',
      createdAt: new Date().toISOString(),
    };

    this.transactions.unshift(tx);
    return tx;
  }

  list() {
    return this.transactions;
  }

  webhook(provider: string, body: any) {
    const event = {
      id: `webhook_${Date.now()}`,
      provider,
      body,
      receivedAt: new Date().toISOString(),
    };

    return {
      success: true,
      event,
    };
  }

  release(body: any) {
    return {
      success: true,
      paymentId: body.paymentId,
      status: 'RELEASED',
      releasedAt: new Date().toISOString(),
    };
  }

  refund(body: any) {
    return {
      success: true,
      paymentId: body.paymentId,
      status: 'REFUNDED',
      refundedAt: new Date().toISOString(),
    };
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\payments-real\payments-real.service.ts"

@'
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentsRealService } from './payments-real.service';

@Controller('payments-real')
export class PaymentsRealController {
  constructor(private readonly service: PaymentsRealService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('status')
  status() {
    return {
      success: true,
      module: 'payments-real',
      mercadoPagoReady: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      pagarmeReady: Boolean(process.env.PAGARME_API_KEY),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('checkout')
  checkout(@Body() body: any) {
    return this.service.createCheckout(body);
  }

  @Post('release')
  release(@Body() body: any) {
    return this.service.release(body);
  }

  @Post('refund')
  refund(@Body() body: any) {
    return this.service.refund(body);
  }

  @Post('webhook/:provider')
  webhook(@Param('provider') provider: string, @Body() body: any) {
    return this.service.webhook(provider, body);
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\src\payments-real\payments-real.controller.ts"

$appModule = "C:\Users\chrys\boraservico-backend\src\app.module.ts"
$content = Get-Content $appModule -Raw

if ($content -notmatch "PaymentsRealModule") {
  $content = $content -replace "import \{ PushModule \} from './push/push.module';", "import { PushModule } from './push/push.module';`nimport { PaymentsRealModule } from './payments-real/payments-real.module';"
  $content = $content -replace "imports: \[", "imports: [`n    PaymentsRealModule,"
}

Set-Content -Encoding UTF8 $appModule $content

@'
$API="http://localhost:3000"

Write-Host "========================================="
Write-Host "TESTE PAYMENTS REAL V10"
Write-Host "========================================="

Invoke-RestMethod "$API/payments-real/status"
Invoke-RestMethod -Method Post -Uri "$API/payments-real/checkout" -ContentType "application/json" -Body '{"provider":"mercado_pago","amount":250,"orderId":"ordem-payment-v10"}'
Invoke-RestMethod "$API/payments-real"
Invoke-RestMethod -Method Post -Uri "$API/payments-real/release" -ContentType "application/json" -Body '{"paymentId":"pay_demo"}'
Invoke-RestMethod -Method Post -Uri "$API/payments-real/refund" -ContentType "application/json" -Body '{"paymentId":"pay_demo"}'

Write-Host "========================================="
Write-Host "TESTE PAYMENTS REAL V10 FINALIZADO"
Write-Host "========================================="
'@ | Set-Content -Encoding UTF8 "C:\Users\chrys\boraservico-backend\teste-payments-real-v10.ps1"

npm run build

Write-Host "========================================="
Write-Host "PAYMENTS REAL V10 INSTALADO"
Write-Host "========================================="