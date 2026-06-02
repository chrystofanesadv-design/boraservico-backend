import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { AuditService } from '../security/audit.service';

type LedgerSource =
  | 'ORDER'
  | 'PAYMENT'
  | 'ESCROW'
  | 'REFERRAL'
  | 'PIX'
  | 'MANUAL'
  | 'SYSTEM';

type LedgerStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface LedgerInput {
  userId?: string;
  amount?: any;
  orderId?: string;
  source?: any;
  note?: any;
  metadata?: Record<string, any>;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudService: FraudService,
    private readonly auditService: AuditService,
  ) {}

  async getWallet(userId?: string, take = 20) {
    const normalizedUserId = this.requireUserId(userId);
    await this.requireUser(this.prisma, normalizedUserId);

    const wallet = await this.ensureWallet(this.prisma, normalizedUserId);
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { userId: normalizedUserId },
      orderBy: { timestamp: 'desc' },
      take,
    });

    return this.toPublicWallet(wallet, transactions);
  }

  async getTransactions(userId?: string, take = 100) {
    const normalizedUserId = this.requireUserId(userId);
    await this.requireUser(this.prisma, normalizedUserId);

    const transactions = await this.prisma.walletTransaction.findMany({
      where: { userId: normalizedUserId },
      orderBy: { timestamp: 'desc' },
      take,
    });

    return {
      success: true,
      userId: normalizedUserId,
      transactions: transactions.map((transaction) =>
        this.toPublicTransaction(transaction),
      ),
    };
  }

  async credit(input: LedgerInput & { escrow?: any; protected?: any }) {
    const userId = this.requireUserId(input.userId);
    const amount = this.requireAmount(input.amount);
    const creditToEscrow = this.readBoolean(input.escrow ?? input.protected);

    return this.prisma.$transaction(async (tx: any) => {
      await this.requireUser(tx, userId);

      const wallet = await this.ensureWallet(tx, userId);
      const before = this.readBalances(wallet);
      const after = {
        availableBalance: creditToEscrow
          ? before.availableBalance
          : this.roundCurrency(before.availableBalance + amount),
        escrowBalance: creditToEscrow
          ? this.roundCurrency(before.escrowBalance + amount)
          : before.escrowBalance,
      };
      const updatedWallet = await this.setWalletBalances(tx, userId, after);
      const orderId = await this.findPersistedOrderId(
        tx,
        this.readString(input.orderId),
      );
      const transaction = await tx.walletTransaction.create({
        data: {
          userId,
          orderId,
          type: creditToEscrow ? 'ESCROW_HOLD' : 'CREDIT',
          amount,
          status: 'COMPLETED',
          source: this.normalizeSource(input.source),
          metadata: this.cleanMetadata({
            ...input.metadata,
            note: this.readString(input.note),
            protected: creditToEscrow,
            balanceBefore: before,
            balanceAfter: this.readBalances(updatedWallet),
          }),
        },
      });
      await this.auditWallet(tx, 'WALLET_CREDIT', {
        userId,
        orderId,
        amount,
        transactionId: transaction.id,
        source: transaction.source,
      });

      return this.ledgerResult(updatedWallet, transaction, 'Credito registrado');
    });
  }

  async debit(input: LedgerInput) {
    const userId = this.requireUserId(input.userId);
    const amount = this.requireAmount(input.amount);

    return this.prisma.$transaction(async (tx: any) => {
      await this.requireUser(tx, userId);

      const wallet = await this.ensureWallet(tx, userId);
      const before = this.readBalances(wallet);

      if (before.availableBalance < amount) {
        throw new BadRequestException('Saldo disponivel insuficiente');
      }

      const updatedWallet = await this.setWalletBalances(tx, userId, {
        availableBalance: this.roundCurrency(before.availableBalance - amount),
        escrowBalance: before.escrowBalance,
      });
      const orderId = await this.findPersistedOrderId(
        tx,
        this.readString(input.orderId),
      );
      const transaction = await tx.walletTransaction.create({
        data: {
          userId,
          orderId,
          type: 'DEBIT',
          amount,
          status: 'COMPLETED',
          source: this.normalizeSource(input.source),
          metadata: this.cleanMetadata({
            ...input.metadata,
            note: this.readString(input.note),
            balanceBefore: before,
            balanceAfter: this.readBalances(updatedWallet),
          }),
        },
      });
      await this.auditWallet(tx, 'WALLET_DEBIT', {
        userId,
        orderId,
        amount,
        transactionId: transaction.id,
        source: transaction.source,
      });

      return this.ledgerResult(updatedWallet, transaction, 'Debito registrado');
    });
  }

  async release(input: LedgerInput) {
    const userId = this.requireUserId(input.userId);
    const requestedAmount = this.readAmount(input.amount);

    return this.prisma.$transaction(async (tx: any) => {
      await this.requireUser(tx, userId);

      const wallet = await this.ensureWallet(tx, userId);
      const before = this.readBalances(wallet);
      const amount =
        requestedAmount > 0 ? this.roundCurrency(requestedAmount) : before.escrowBalance;

      if (amount <= 0) {
        throw new BadRequestException('Nao ha saldo em escrow para liberar');
      }

      if (before.escrowBalance < amount) {
        throw new BadRequestException('Saldo em escrow insuficiente');
      }

      const updatedWallet = await this.setWalletBalances(tx, userId, {
        availableBalance: this.roundCurrency(before.availableBalance + amount),
        escrowBalance: this.roundCurrency(before.escrowBalance - amount),
      });
      const orderId = await this.findPersistedOrderId(
        tx,
        this.readString(input.orderId),
      );
      const transaction = await tx.walletTransaction.create({
        data: {
          userId,
          orderId,
          type: 'ESCROW_RELEASE',
          amount,
          status: 'COMPLETED',
          source: 'ESCROW',
          metadata: this.cleanMetadata({
            ...input.metadata,
            note: this.readString(input.note),
            balanceBefore: before,
            balanceAfter: this.readBalances(updatedWallet),
          }),
        },
      });
      await this.auditWallet(tx, 'WALLET_ESCROW_RELEASED', {
        userId,
        orderId,
        amount,
        transactionId: transaction.id,
      });

      return this.ledgerResult(
        updatedWallet,
        transaction,
        'Pagamento liberado do escrow',
      );
    });
  }

  async withdrawPix(
    input: LedgerInput & {
      pixKey?: any;
      pixKeyType?: any;
      holderName?: any;
      document?: any;
    },
  ) {
    const userId = this.requireUserId(input.userId);
    const amount = this.requireAmount(input.amount);
    const pixKey = this.readString(input.pixKey);

    if (!pixKey) {
      throw new BadRequestException('Chave PIX obrigatoria');
    }

    const fraudRisk = await this.scoreWithdrawal({
      type: 'withdrawal',
      userId,
      amount,
      pixKey,
      pixKeyType: input.pixKeyType,
    });

    return this.prisma.$transaction(async (tx: any) => {
      await this.requireUser(tx, userId);

      const wallet = await this.ensureWallet(tx, userId);
      const before = this.readBalances(wallet);

      if (before.availableBalance < amount) {
        throw new BadRequestException('Saldo disponivel insuficiente para PIX');
      }

      const updatedWallet = await this.setWalletBalances(tx, userId, {
        availableBalance: this.roundCurrency(before.availableBalance - amount),
        escrowBalance: before.escrowBalance,
      });
      const withdrawalId = `pix_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const transaction = await tx.walletTransaction.create({
        data: {
          userId,
          type: 'PIX_WITHDRAWAL',
          amount,
          status: 'COMPLETED',
          source: 'PIX',
          metadata: this.cleanMetadata({
            ...input.metadata,
            withdrawalId,
            pixKey: this.maskPixKey(pixKey),
            pixKeyType: this.readString(input.pixKeyType) ?? 'AUTO',
            holderName: this.readString(input.holderName),
            document: this.maskDocument(this.readString(input.document)),
            provider: 'PIX',
            providerStatus: 'READY_FOR_PROCESSING',
            debitedImmediately: true,
            fraudRisk: this.publicFraudRisk(fraudRisk),
            balanceBefore: before,
            balanceAfter: this.readBalances(updatedWallet),
          }),
        },
      });
      await this.auditWallet(tx, 'WALLET_PIX_WITHDRAWAL_REQUESTED', {
        userId,
        amount,
        transactionId: transaction.id,
        source: 'PIX',
        fraudRisk: this.publicFraudRisk(fraudRisk),
      });

      return {
        ...this.ledgerResult(
          updatedWallet,
          transaction,
          'Saque PIX registrado e debitado da wallet',
        ),
        pixWithdrawal: {
          withdrawalId,
          amount,
          status: 'READY_FOR_PROCESSING',
          debitedImmediately: true,
          pixKey: this.maskPixKey(pixKey),
          requestedAt: new Date().toISOString(),
          fraudRisk: this.publicFraudRisk(fraudRisk),
        },
      };
    });
  }

  async creditReferralBonus(input: {
    userId: string;
    amount: number;
    referralId: string;
    referralBonusId?: string;
    orderId?: string;
    phase: number;
    percentage: number;
    serviceValue: number;
  }) {
    return this.credit({
      userId: input.userId,
      amount: input.amount,
      orderId: input.orderId,
      source: 'REFERRAL',
      metadata: {
        referralId: input.referralId,
        referralBonusId: input.referralBonusId,
        phase: input.phase,
        percentage: input.percentage,
        serviceValue: input.serviceValue,
        withdrawable: true,
        pixWithdrawImmediate: true,
      },
    });
  }

  private async requireUser(tx: any, userId: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Usuario da wallet nao encontrado');
    }
  }

  private async ensureWallet(tx: any, userId: string) {
    return tx.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: 0,
        availableBalance: 0,
        escrowBalance: 0,
      },
    });
  }

  private async setWalletBalances(
    tx: any,
    userId: string,
    balances: { availableBalance: number; escrowBalance: number },
  ) {
    const availableBalance = this.roundCurrency(balances.availableBalance);
    const escrowBalance = this.roundCurrency(balances.escrowBalance);

    return tx.wallet.update({
      where: { userId },
      data: {
        availableBalance,
        escrowBalance,
        balance: this.roundCurrency(availableBalance + escrowBalance),
      },
    });
  }

  private async findPersistedOrderId(tx: any, orderId?: string) {
    if (!orderId) {
      return undefined;
    }

    const order = await tx.serviceOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    return order?.id;
  }

  private async auditWallet(tx: any, action: string, data: Record<string, any>) {
    await tx.paymentAudit.create({
      data: {
        orderId: this.readString(data.orderId),
        action,
        amount: this.readAmount(data.amount),
        metadata: this.cleanMetadata({
          domain: 'wallet',
          actorId: this.readString(data.userId),
          userId: this.readString(data.userId),
          entityType: 'walletTransaction',
          entityId: this.readString(data.transactionId),
          source: this.readString(data.source),
          fraudRisk: data.fraudRisk,
          persistedVia: 'PaymentAudit',
        }),
      },
    }).catch(() => undefined);
  }

  private async scoreWithdrawal(data: any) {
    try {
      return await this.fraudService.analyzeWithdrawal(data, {
        userId: data?.userId,
      });
    } catch {
      return undefined;
    }
  }

  private publicFraudRisk(fraudRisk?: any) {
    if (!fraudRisk) {
      return undefined;
    }

    return {
      score: fraudRisk.riskScore ?? fraudRisk.score,
      level: fraudRisk.riskLevel ?? fraudRisk.level,
      approved: fraudRisk.approved,
      reasons: fraudRisk.reasons,
    };
  }

  private ledgerResult(wallet: any, transaction: any, statusLabel: string) {
    const balances = this.readBalances(wallet);

    return {
      success: true,
      userId: wallet.userId,
      balance: balances.totalBalance,
      totalBalance: balances.totalBalance,
      availableBalance: balances.availableBalance,
      escrow: balances.escrowBalance,
      escrowBalance: balances.escrowBalance,
      protectedAmount: balances.escrowBalance,
      platformFee: this.roundCurrency(balances.escrowBalance * 0.12),
      releasedAmount:
        transaction?.type === 'ESCROW_RELEASE'
          ? Number(transaction.amount ?? 0)
          : 0,
      statusLabel,
      updatedAt: wallet.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      transaction: transaction
        ? this.toPublicTransaction(transaction)
        : undefined,
    };
  }

  private toPublicWallet(wallet: any, transactions: any[] = []) {
    const balances = this.readBalances(wallet);

    return {
      success: true,
      userId: wallet.userId,
      balance: balances.totalBalance,
      totalBalance: balances.totalBalance,
      availableBalance: balances.availableBalance,
      escrow: balances.escrowBalance,
      escrowBalance: balances.escrowBalance,
      protectedAmount: balances.escrowBalance,
      platformFee: this.roundCurrency(balances.escrowBalance * 0.12),
      releasedAmount: 0,
      statusLabel:
        balances.escrowBalance > 0
          ? 'Pagamento protegido em escrow'
          : 'Wallet disponivel para PIX',
      updatedAt: wallet.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      transactions: transactions.map((transaction) =>
        this.toPublicTransaction(transaction),
      ),
    };
  }

  private toPublicTransaction(transaction: any) {
    return {
      id: transaction.id,
      userId: transaction.userId,
      orderId: transaction.orderId,
      type: transaction.type,
      amount: Number(transaction.amount ?? 0),
      status: transaction.status as LedgerStatus,
      source: transaction.source as LedgerSource,
      metadata: transaction.metadata,
      timestamp:
        transaction.timestamp?.toISOString?.() ??
        transaction.timestamp ??
        new Date().toISOString(),
      createdAt:
        transaction.timestamp?.toISOString?.() ??
        transaction.timestamp ??
        new Date().toISOString(),
    };
  }

  private readBalances(wallet: any) {
    const availableBalance = this.roundCurrency(
      Number(wallet?.availableBalance ?? 0),
    );
    const escrowBalance = this.roundCurrency(Number(wallet?.escrowBalance ?? 0));
    const totalBalance = this.roundCurrency(availableBalance + escrowBalance);

    return {
      availableBalance,
      escrowBalance,
      totalBalance,
    };
  }

  private normalizeSource(value: any): LedgerSource {
    const source = this.readString(value)?.toUpperCase();
    const allowed: LedgerSource[] = [
      'ORDER',
      'PAYMENT',
      'ESCROW',
      'REFERRAL',
      'PIX',
      'MANUAL',
      'SYSTEM',
    ];

    return allowed.includes(source as LedgerSource)
      ? (source as LedgerSource)
      : 'MANUAL';
  }

  private requireUserId(value: any) {
    const userId = this.readString(value);

    if (!userId) {
      throw new BadRequestException('userId obrigatorio');
    }

    return userId;
  }

  private requireAmount(value: any) {
    const amount = this.readAmount(value);

    if (amount <= 0) {
      throw new BadRequestException('Valor deve ser maior que zero');
    }

    return amount;
  }

  private readAmount(value: any) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? this.roundCurrency(amount) : 0;
  }

  private readBoolean(value: any) {
    if (typeof value === 'boolean') {
      return value;
    }

    const text = this.readString(value)?.toLowerCase();

    return text === 'true' || text === '1' || text === 'yes';
  }

  private cleanMetadata(metadata: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    );
  }

  private maskPixKey(value: string) {
    if (value.length <= 6) {
      return '*'.repeat(value.length);
    }

    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }

  private maskDocument(value?: string) {
    if (!value) {
      return undefined;
    }

    const digits = value.replace(/\D/g, '');

    if (digits.length <= 4) {
      return '*'.repeat(digits.length);
    }

    return `***${digits.slice(-4)}`;
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }
}
