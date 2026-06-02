import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
  async getWallet(@Query('userId') userId?: string) {
    const wallet = await this.tryGetPersistedWallet(userId);

    if (wallet) {
      return wallet;
    }

    return this.publicWallet();
  }

  @Post('credit')
  @UseGuards(JwtAuthGuard)
  async credit(@Body() body: any) {
    const amount = this.readAmount(body?.amount);
    const persisted = await this.tryCreditPersistedWallet(body, amount);

    if (persisted) {
      return this.emitWalletPayload(persisted);
    }

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
  @UseGuards(JwtAuthGuard)
  async debit(@Body() body: any) {
    const amount = this.readAmount(body?.amount);
    const persisted = await this.tryDebitPersistedWallet(body, amount);

    if (persisted) {
      return this.emitWalletPayload(persisted);
    }

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
  @UseGuards(JwtAuthGuard)
  async release(@Body() body: any) {
    const requestedAmount = this.readAmount(body?.amount);
    const persisted = await this.tryReleasePersistedWallet(
      body,
      requestedAmount,
    );

    if (persisted) {
      RealtimeGateway.emitOperational('payment-released', {
        ...persisted,
        orderId: persisted.orderId,
        message: persisted.statusLabel,
        timestamp: persisted.updatedAt,
      });

      return persisted;
    }

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
  @UseGuards(JwtAuthGuard)
  async getTransactions(@Query('userId') userId?: string) {
    const persisted = await this.tryGetPersistedTransactions(userId);

    if (persisted) {
      return persisted;
    }

    return this.transactions;
  }

  private async tryGetPersistedWallet(userId?: string) {
    const normalizedUserId = this.readString(userId);

    if (!normalizedUserId) {
      return null;
    }

    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: normalizedUserId },
      });
      const transactions = await this.prisma.walletTransaction.findMany({
        where: { userId: normalizedUserId },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });

      return wallet
        ? this.publicPersistedWallet(wallet, transactions)
        : this.publicEmptyPersistedWallet(normalizedUserId);
    } catch {
      return null;
    }
  }

  private async tryGetPersistedTransactions(userId?: string) {
    const normalizedUserId = this.readString(userId);

    if (!normalizedUserId) {
      return null;
    }

    try {
      const transactions = await this.prisma.walletTransaction.findMany({
        where: { userId: normalizedUserId },
        orderBy: { timestamp: 'desc' },
        take: 100,
      });

      return transactions.map((transaction) =>
        this.publicPersistedTransaction(transaction),
      );
    } catch {
      return null;
    }
  }

  private async tryCreditPersistedWallet(body: any, amount: number) {
    const userId = this.readString(body?.userId);

    if (!userId || amount <= 0) {
      return null;
    }

    try {
      const orderId = await this.findPersistedOrderId(
        this.readString(body?.orderId),
      );

      await this.prisma.wallet.upsert({
        where: { userId },
        update: {
          balance: { increment: amount },
          escrowBalance: { increment: amount },
        },
        create: {
          userId,
          balance: amount,
          escrowBalance: amount,
          availableBalance: 0,
        },
      });

      await this.prisma.walletTransaction.create({
        data: {
          userId,
          orderId,
          type: 'CREDIT',
          amount,
          status: 'COMPLETED',
          source: this.normalizeTransactionSource(body?.source),
          metadata: {
            note: this.readString(body?.note),
            protected: true,
          },
        },
      });

      return this.tryGetPersistedWallet(userId);
    } catch {
      return null;
    }
  }

  private async tryDebitPersistedWallet(body: any, amount: number) {
    const userId = this.readString(body?.userId);

    if (!userId || amount <= 0) {
      return null;
    }

    try {
      const orderId = await this.findPersistedOrderId(
        this.readString(body?.orderId),
      );

      await this.prisma.wallet.upsert({
        where: { userId },
        update: {
          balance: { decrement: amount },
          availableBalance: { decrement: amount },
        },
        create: {
          userId,
          balance: -amount,
          escrowBalance: 0,
          availableBalance: -amount,
        },
      });

      await this.prisma.walletTransaction.create({
        data: {
          userId,
          orderId,
          type: 'DEBIT',
          amount,
          status: 'COMPLETED',
          source: this.normalizeTransactionSource(body?.source),
          metadata: {
            note: this.readString(body?.note),
          },
        },
      });

      return this.tryGetPersistedWallet(userId);
    } catch {
      return null;
    }
  }

  private async tryReleasePersistedWallet(body: any, requestedAmount: number) {
    const userId = this.readString(body?.userId);

    if (!userId) {
      return null;
    }

    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        return null;
      }

      const escrowBalance = Number(wallet.escrowBalance ?? 0);
      const releaseAmount = this.roundCurrency(
        requestedAmount > 0 ? requestedAmount : escrowBalance,
      );
      const orderId = await this.findPersistedOrderId(
        this.readString(body?.orderId),
      );

      await this.prisma.wallet.update({
        where: { userId },
        data: {
          escrowBalance: { decrement: Math.min(releaseAmount, escrowBalance) },
          availableBalance: { increment: releaseAmount },
        },
      });

      await this.prisma.walletTransaction.create({
        data: {
          userId,
          orderId,
          type: 'ESCROW_RELEASE',
          amount: releaseAmount,
          status: 'COMPLETED',
          source: 'ESCROW',
          metadata: {
            note: this.readString(body?.note),
          },
        },
      });

      const payload = await this.tryGetPersistedWallet(userId);

      return payload
        ? {
            ...payload,
            orderId: this.readString(body?.orderId),
            releasedAmount: releaseAmount,
            statusLabel: 'Pagamento liberado com protecao',
          }
        : null;
    } catch {
      return null;
    }
  }

  private emitWalletPayload(payload: Record<string, any>) {
    RealtimeGateway.emitOperational('wallet-update', {
      ...payload,
      message: payload.statusLabel,
      timestamp: payload.updatedAt,
    });

    return payload;
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

  private publicPersistedWallet(wallet: any, transactions: any[] = []) {
    const escrowBalance = Number(wallet.escrowBalance ?? 0);

    return {
      success: true,
      userId: wallet.userId,
      balance: Number(wallet.balance ?? 0),
      escrow: escrowBalance,
      escrowBalance,
      availableBalance: Number(wallet.availableBalance ?? 0),
      protectedAmount: escrowBalance,
      platformFee: this.roundCurrency(escrowBalance * 0.12),
      releasedAmount: 0,
      statusLabel:
        escrowBalance > 0
          ? 'Pagamento protegido em escrow'
          : 'Wallet disponivel para PIX',
      updatedAt: wallet.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      transactions: transactions.map((transaction) =>
        this.publicPersistedTransaction(transaction),
      ),
    };
  }

  private publicEmptyPersistedWallet(userId: string) {
    return {
      success: true,
      userId,
      balance: 0,
      escrow: 0,
      escrowBalance: 0,
      availableBalance: 0,
      protectedAmount: 0,
      platformFee: 0,
      releasedAmount: 0,
      statusLabel: 'Wallet sem saldo',
      updatedAt: new Date().toISOString(),
      transactions: [],
    };
  }

  private publicPersistedTransaction(transaction: any) {
    return {
      ...transaction,
      amount: Number(transaction.amount ?? 0),
      createdAt:
        transaction.timestamp?.toISOString?.() ??
        transaction.timestamp ??
        new Date().toISOString(),
    };
  }

  private readAmount(value: any) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private normalizeTransactionSource(value: any) {
    const source = this.readString(value)?.toUpperCase();
    const allowed = ['ORDER', 'PAYMENT', 'ESCROW', 'REFERRAL', 'PIX', 'MANUAL', 'SYSTEM'];

    return source && allowed.includes(source) ? source : 'MANUAL';
  }

  private async findPersistedOrderId(orderId?: string) {
    if (!orderId) {
      return undefined;
    }

    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    return order?.id;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }
}
