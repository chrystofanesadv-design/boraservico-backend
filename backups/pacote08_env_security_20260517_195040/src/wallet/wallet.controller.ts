import { Body, Controller, Get, Post } from '@nestjs/common';

import { RealtimeGateway } from '../realtime/realtime.gateway';

interface WalletState {
  balance: number;
  escrow: number;
  protectedAmount: number;
  platformFee: number;
  releasedAmount: number;
  statusLabel: string;
  updatedAt: Date;
}

@Controller('wallet')
export class WalletController {
  private wallet: WalletState = {
    balance: 189.9,
    escrow: 189.9,
    protectedAmount: 189.9,
    platformFee: 22.79,
    releasedAmount: 0,
    statusLabel: 'Pagamento protegido em escrow',
    updatedAt: new Date(),
  };

  private readonly transactions: any[] = [];

  @Get()
  getWallet() {
    return this.publicWallet();
  }

  @Post('credit')
  credit(@Body() body: any) {
    const amount = this.readAmount(body?.amount);

    this.wallet.balance = this.roundCurrency(this.wallet.balance + amount);
    this.wallet.protectedAmount = this.roundCurrency(
      this.wallet.protectedAmount + amount,
    );
    this.wallet.escrow = this.roundCurrency(this.wallet.escrow + amount);
    this.wallet.platformFee = this.roundCurrency(
      this.wallet.protectedAmount * 0.12,
    );
    this.wallet.statusLabel = 'Credito protegido em escrow';
    this.wallet.updatedAt = new Date();

    this.transactions.unshift({
      type: 'credit',
      amount,
      orderId: body?.orderId,
      createdAt: this.wallet.updatedAt.toISOString(),
    });

    return this.emitWalletUpdate(body?.orderId);
  }

  @Post('debit')
  debit(@Body() body: any) {
    const amount = this.readAmount(body?.amount);

    this.wallet.balance = this.roundCurrency(this.wallet.balance - amount);
    this.wallet.escrow = this.roundCurrency(
      Math.max(0, this.wallet.escrow - amount),
    );
    this.wallet.protectedAmount = this.roundCurrency(
      Math.max(0, this.wallet.protectedAmount - amount),
    );
    this.wallet.platformFee = this.roundCurrency(
      this.wallet.protectedAmount * 0.12,
    );
    this.wallet.statusLabel = 'Debito registrado na wallet';
    this.wallet.updatedAt = new Date();

    this.transactions.unshift({
      type: 'debit',
      amount,
      orderId: body?.orderId,
      createdAt: this.wallet.updatedAt.toISOString(),
    });

    return this.emitWalletUpdate(body?.orderId);
  }

  @Post('release')
  release(@Body() body: any) {
    const requestedAmount = this.readAmount(body?.amount);
    const releaseBase =
      requestedAmount > 0 ? requestedAmount : this.wallet.protectedAmount;

    this.wallet.releasedAmount = this.roundCurrency(releaseBase);
    this.wallet.escrow = 0;
    this.wallet.statusLabel = 'Pagamento liberado com protecao';
    this.wallet.updatedAt = new Date();

    this.transactions.unshift({
      type: 'release',
      amount: this.wallet.releasedAmount,
      orderId: body?.orderId,
      createdAt: this.wallet.updatedAt.toISOString(),
    });

    const payload = this.publicWallet(body?.orderId);

    RealtimeGateway.emitOperational('payment-released', {
      ...payload,
      orderId: payload.orderId,
      message: payload.statusLabel,
      timestamp: payload.updatedAt,
    });

    return payload;
  }

  @Get('transactions')
  getTransactions() {
    return this.transactions;
  }

  private emitWalletUpdate(orderId?: string) {
    const payload = this.publicWallet(orderId);

    RealtimeGateway.emitOperational('wallet-update', {
      ...payload,
      message: payload.statusLabel,
      timestamp: payload.updatedAt,
    });

    return payload;
  }

  private publicWallet(orderId?: string) {
    const payload: Record<string, any> = {
      success: true,
      balance: this.wallet.balance,
      escrow: this.wallet.escrow,
      protectedAmount: this.wallet.protectedAmount,
      platformFee: this.wallet.platformFee,
      releasedAmount: this.wallet.releasedAmount,
      statusLabel: this.wallet.statusLabel,
      updatedAt: this.wallet.updatedAt.toISOString(),
      transactions: this.transactions.slice(0, 20),
    };

    const normalizedOrderId = orderId?.toString().trim();

    if (normalizedOrderId) {
      payload.orderId = normalizedOrderId;
    }

    return payload;
  }

  private readAmount(value: any) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }
}
