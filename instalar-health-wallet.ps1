Write-Host ""
Write-Host "========================================="
Write-Host "INSTALADOR HEALTH + WALLET BORASERVICO"
Write-Host "========================================="
Write-Host ""

$backendPath = "C:\Users\chrys\boraservico-backend"

if (!(Test-Path $backendPath)) {
    Write-Host "[ERRO] Backend nao encontrado."
    exit
}

Set-Location $backendPath

# =========================================
# HEALTH MODULE
# =========================================

Write-Host "[1/8] Criando Health Module..."

New-Item -ItemType Directory -Force -Path "$backendPath\src\health" | Out-Null

@'
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'BoraServico Backend',
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }
}
'@ | Set-Content "$backendPath\src\health\health.controller.ts"

@'
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
'@ | Set-Content "$backendPath\src\health\health.module.ts"

# =========================================
# WALLET MODULE
# =========================================

Write-Host "[2/8] Criando Wallet Module..."

New-Item -ItemType Directory -Force -Path "$backendPath\src\wallet" | Out-Null

@'
import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';

@Controller('wallet')
export class WalletController {

  private balance = 0;

  private transactions: any[] = [];

  @Get()
  getWallet() {
    return {
      balance: this.balance,
    };
  }

  @Post('credit')
  credit(@Body() body: any) {

    const amount = Number(body.amount || 0);

    this.balance += amount;

    this.transactions.push({
      type: 'credit',
      amount,
      createdAt: new Date(),
    });

    return {
      success: true,
      balance: this.balance,
    };
  }

  @Post('debit')
  debit(@Body() body: any) {

    const amount = Number(body.amount || 0);

    this.balance -= amount;

    this.transactions.push({
      type: 'debit',
      amount,
      createdAt: new Date(),
    });

    return {
      success: true,
      balance: this.balance,
    };
  }

  @Get('transactions')
  getTransactions() {
    return this.transactions;
  }
}
'@ | Set-Content "$backendPath\src\wallet\wallet.controller.ts"

@'
import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
})
export class WalletModule {}
'@ | Set-Content "$backendPath\src\wallet\wallet.module.ts"

# =========================================
# APP MODULE UPDATE
# =========================================

Write-Host "[3/8] Atualizando AppModule..."

$appModule = "$backendPath\src\app.module.ts"

$appContent = Get-Content $appModule -Raw

if ($appContent -notmatch "HealthModule") {

    $appContent = $appContent.Replace(
        "import { OrdersModule } from './orders/orders.module';",
@"
import { OrdersModule } from './orders/orders.module';
import { HealthModule } from './health/health.module';
import { WalletModule } from './wallet/wallet.module';
"@
    )
}

$appContent = $appContent.Replace(
    "OrdersModule,",
@"
OrdersModule,
    HealthModule,
    WalletModule,
"@
)

Set-Content $appModule $appContent

# =========================================
# FINAL
# =========================================

Write-Host ""
Write-Host "[4/8] Health instalado."
Write-Host "[5/8] Wallet instalado."
Write-Host "[6/8] AppModule atualizado."
Write-Host ""
Write-Host "========================================="
Write-Host "INSTALACAO FINALIZADA"
Write-Host "========================================="
Write-Host ""
Write-Host "AGORA EXECUTE:"
Write-Host ""
Write-Host "cd C:\Users\chrys\boraservico-backend"
Write-Host "npm run start:dev"
Write-Host ""
Write-Host "TESTES:"
Write-Host ""
Write-Host "Invoke-RestMethod http://localhost:3000/health"
Write-Host "Invoke-RestMethod http://localhost:3000/wallet"
Write-Host ""