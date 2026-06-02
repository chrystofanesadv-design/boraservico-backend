Write-Host "========================================="
Write-Host "INSTALANDO PAYMENTS + ESCROW ENGINE"
Write-Host "========================================="

$backend = "C:\Users\chrys\boraservico-backend"
$payments = "$backend\src\payments"

New-Item -ItemType Directory -Force -Path $payments | Out-Null

@'
import { Injectable } from '@nestjs/common';

type PaymentStatus =
  | 'ESCROW_HELD'
  | 'RELEASED'
  | 'REFUNDED'
  | 'PARTIAL_REFUND'
  | 'SPLIT_DONE';

interface PaymentMock {
  id: string;
  orderId: string;
  clientId: string;
  professionalId: string;
  amount: number;
  platformFee: number;
  professionalAmount: number;
  refundAmount: number;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  releasedAt?: Date;
  refundedAt?: Date;
}

@Injectable()
export class PaymentsService {
  private payments: PaymentMock[] = [];

  createEscrow(data: any) {
    const amount = Number(data?.amount ?? 0);
    const platformFee = amount * 0.10;
    const professionalAmount = amount - platformFee;

    const payment: PaymentMock = {
      id: crypto.randomUUID(),
      orderId: data?.orderId,
      clientId: data?.clientId,
      professionalId: data?.professionalId,
      amount,
      platformFee,
      professionalAmount,
      refundAmount: 0,
      status: 'ESCROW_HELD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.payments.push(payment);

    return payment;
  }

  release(id: string) {
    const payment = this.findOne(id);

    if (!payment) {
      return {
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    payment.status = 'RELEASED';
    payment.releasedAt = new Date();
    payment.updatedAt = new Date();

    return {
      success: true,
      payment,
      walletCredit: {
        userId: payment.professionalId,
        amount: payment.professionalAmount,
        withdrawable: true,
      },
      platformRevenue: payment.platformFee,
    };
  }

  refund(id: string, data: any) {
    const payment = this.findOne(id);

    if (!payment) {
      return {
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    const refundAmount = Number(data?.refundAmount ?? payment.amount);

    payment.refundAmount = Math.min(refundAmount, payment.amount);

    if (payment.refundAmount >= payment.amount) {
      payment.status = 'REFUNDED';
      payment.professionalAmount = 0;
      payment.platformFee = 0;
    } else {
      payment.status = 'PARTIAL_REFUND';
      payment.professionalAmount = payment.amount - payment.refundAmount - payment.platformFee;

      if (payment.professionalAmount < 0) {
        payment.professionalAmount = 0;
      }
    }

    payment.refundedAt = new Date();
    payment.updatedAt = new Date();

    return {
      success: true,
      payment,
      clientRefund: {
        userId: payment.clientId,
        amount: payment.refundAmount,
      },
      professionalCredit: {
        userId: payment.professionalId,
        amount: payment.professionalAmount,
        withdrawable: true,
      },
    };
  }

  split(id: string) {
    const payment = this.findOne(id);

    if (!payment) {
      return {
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    payment.status = 'SPLIT_DONE';
    payment.updatedAt = new Date();

    return {
      success: true,
      split: {
        total: payment.amount,
        platformFee: payment.platformFee,
        professionalAmount: payment.professionalAmount,
      },
      payment,
    };
  }

  findAll() {
    return this.payments;
  }

  findOne(id: string) {
    return this.payments.find((item) => item.id === id) ?? null;
  }
}
'@ | Set-Content "$payments\payments.service.ts" -Encoding UTF8

@'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get()
  findAll(): any {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): any {
    return this.paymentsService.findOne(id);
  }

  @Post('escrow')
  escrow(@Body() body: any): any {
    return this.paymentsService.createEscrow(body);
  }

  @Post(':id/release')
  release(@Param('id') id: string): any {
    return this.paymentsService.release(id);
  }

  @Post(':id/refund')
  refund(
    @Param('id') id: string,
    @Body() body: any,
  ): any {
    return this.paymentsService.refund(id, body);
  }

  @Post(':id/split')
  split(@Param('id') id: string): any {
    return this.paymentsService.split(id);
  }
}
'@ | Set-Content "$payments\payments.controller.ts" -Encoding UTF8

@'
import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
'@ | Set-Content "$payments\payments.module.ts" -Encoding UTF8

Write-Host "========================================="
Write-Host "PAYMENTS + ESCROW ENGINE INSTALADO"
Write-Host "========================================="
