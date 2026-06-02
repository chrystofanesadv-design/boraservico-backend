import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'crypto';

import {
  getMercadoPagoAccessToken,
  getMercadoPagoWebhookSecret,
  getPagarmeApiKey,
  getPagarmeRecipientId,
  getPagarmeWebhookSecret,
  getPlatformCommissionRate,
  getPublicApiUrl,
  readEnv,
} from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { PushRealService } from '../push-real/push-real.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FraudService } from '../fraud/fraud.service';

type Provider = 'MERCADO_PAGO' | 'PAGARME' | 'PIX' | 'STRIPE' | 'MANUAL';
type PaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'ESCROW_HELD'
  | 'RELEASED'
  | 'REFUNDED'
  | 'PARTIAL_REFUND'
  | 'SPLIT_DONE'
  | 'CANCELED'
  | 'FAILED';
type EscrowStatus = 'HELD' | 'RELEASED' | 'REFUNDED';

interface CheckoutInput {
  orderId: string;
  provider: Provider;
  amount: number;
  commission: number;
  professionalAmount: number;
  title: string;
  description: string;
  clientId?: string;
  professionalId?: string;
  body: Record<string, any>;
}

interface ProviderCheckoutResult {
  providerPaymentId: string;
  checkoutUrl?: string;
  providerStatus?: string;
  raw?: any;
}

interface WebhookPaymentData {
  provider: Provider;
  providerPaymentId?: string;
  providerEventId: string;
  status: PaymentStatus;
  providerStatus?: string;
  orderId?: string;
  amount?: number;
  paidAt?: Date;
  raw: any;
}

@Injectable()
export class PaymentsService {
  private readonly platformCommissionRate = getPlatformCommissionRate();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushRealService: PushRealService,
    private readonly fraudService: FraudService,
  ) {}

  async createCheckout(body: any) {
    const input = await this.resolveCheckoutInput(body);
    const initialProviderReference = `local_${randomUUID()}`;
    const fraudRisk = await this.scorePayment({
      ...input.body,
      type: 'payment',
      orderId: input.orderId,
      provider: input.provider,
      amount: input.amount,
      clientId: input.clientId,
      professionalId: input.professionalId,
    });
    const payment = await this.prisma.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.provider as any,
        providerPaymentId: initialProviderReference,
        status: 'PENDING',
        amount: input.amount,
        commission: input.commission,
        escrowStatus: 'HELD',
        metadata: this.cleanMetadata({
          clientId: input.clientId,
          professionalId: input.professionalId,
          professionalAmount: input.professionalAmount,
          checkoutReady: false,
          providerConfigured: this.isProviderConfigured(input.provider),
          providerReference: initialProviderReference,
          fraudRisk: this.publicFraudRisk(fraudRisk),
          split: this.buildSplit(input),
        }),
      },
    });

    await this.auditPayment(this.prisma, {
      paymentId: payment.id,
      orderId: payment.orderId,
      provider: input.provider,
      action: 'CHECKOUT_REQUESTED',
      status: 'PENDING',
      amount: input.amount,
      metadata: {
        checkoutReady: false,
        providerConfigured: this.isProviderConfigured(input.provider),
        fraudRisk: this.publicFraudRisk(fraudRisk),
      },
    });

    if (!this.isProviderConfigured(input.provider)) {
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          metadata: this.cleanMetadata({
            ...this.readMetadata(payment.metadata),
            checkoutReady: false,
            requiresProviderConfiguration: true,
            providerMessage:
              'Configure as credenciais do provedor para gerar checkout externo.',
          }),
        },
      });

      await this.auditPayment(this.prisma, {
        paymentId: updated.id,
        orderId: updated.orderId,
        provider: input.provider,
        action: 'CHECKOUT_CONFIGURATION_REQUIRED',
        status: 'PENDING',
        amount: input.amount,
      });

      return this.toPublicPayment(updated);
    }

    try {
      const providerCheckout = await this.createProviderCheckout(input, payment.id);
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: providerCheckout.providerPaymentId,
          metadata: this.cleanMetadata({
            ...this.readMetadata(payment.metadata),
            checkoutReady: true,
            checkoutUrl: providerCheckout.checkoutUrl,
            providerStatus: providerCheckout.providerStatus,
            providerRaw: this.safeProviderPayload(providerCheckout.raw),
            providerReference: providerCheckout.providerPaymentId,
          }),
        },
      });

      await this.auditPayment(this.prisma, {
        paymentId: updated.id,
        orderId: updated.orderId,
        provider: input.provider,
        action: 'CHECKOUT_CREATED',
        status: 'PENDING',
        amount: input.amount,
        metadata: {
          providerPaymentId: providerCheckout.providerPaymentId,
          checkoutReady: true,
        },
      });

      return this.toPublicPayment(updated);
    } catch (error) {
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          metadata: this.cleanMetadata({
            ...this.readMetadata(payment.metadata),
            checkoutReady: false,
            providerError: this.providerErrorMessage(error),
          }),
        },
      });

      await this.auditPayment(this.prisma, {
        paymentId: updated.id,
        orderId: updated.orderId,
        provider: input.provider,
        action: 'CHECKOUT_FAILED',
        status: 'FAILED',
        amount: input.amount,
        metadata: {
          providerError: this.providerErrorMessage(error),
        },
      });

      return this.toPublicPayment(updated);
    }
  }

  async createEscrow(data: any) {
    const input = await this.resolveCheckoutInput({
      ...data,
      provider: data?.provider ?? 'MANUAL',
    });
    const fraudRisk = await this.scorePayment({
      ...input.body,
      type: 'payment',
      orderId: input.orderId,
      provider: input.provider,
      providerPaymentId: data?.providerPaymentId,
      amount: input.amount,
      clientId: input.clientId,
      professionalId: input.professionalId,
    });

    const existing = await this.prisma.payment.findFirst({
      where: {
        orderId: input.orderId,
        status: { in: ['ESCROW_HELD', 'PAID', 'SPLIT_DONE'] as any },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.toPublicPayment(existing);
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.provider as any,
        providerPaymentId: this.readString(data?.providerPaymentId),
        status: 'PAID',
        amount: input.amount,
        commission: input.commission,
        escrowStatus: 'HELD',
        paidAt: new Date(),
        metadata: this.cleanMetadata({
          clientId: input.clientId,
          professionalId: input.professionalId,
          professionalAmount: input.professionalAmount,
          fraudRisk: this.publicFraudRisk(fraudRisk),
          split: this.buildSplit(input),
          source: 'direct_escrow',
        }),
      },
    });

    const settled = await this.settleEscrowHold(payment.id, {
      source: 'MANUAL_ESCROW',
    });

    this.emitPaymentApproved(settled.payment);

    return settled.payment;
  }

  async handleWebhook(
    providerValue: string,
    body: any,
    headers: Record<string, any> = {},
    rawBody?: Buffer | string,
    query: Record<string, any> = {},
  ) {
    const provider = this.normalizeProvider(providerValue);

    if (provider !== 'MERCADO_PAGO' && provider !== 'PAGARME') {
      throw new BadRequestException('Provider de webhook nao suportado');
    }

    const signatureDigest = this.verifyWebhookSignature(
      provider,
      body,
      headers,
      rawBody,
      query,
    );
    const normalized = await this.normalizeWebhookPaymentData(
      provider,
      body,
      query,
    );
    const webhookFraudRisk = await this.scoreWebhook({
      type: 'webhook',
      provider,
      providerEventId: normalized.providerEventId,
      providerPaymentId: normalized.providerPaymentId,
      amount: normalized.amount,
      orderId: normalized.orderId,
    });

    let webhookEvent: any;

    try {
      webhookEvent = await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: provider as any,
          providerEventId: normalized.providerEventId,
          providerPaymentId: normalized.providerPaymentId,
          signatureDigest,
          status: 'PROCESSING',
          payload: this.safeProviderPayload(normalized.raw),
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.paymentWebhookEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider: provider as any,
              providerEventId: normalized.providerEventId,
            },
          },
        });
        const fraudRisk = await this.scoreWebhook({
          type: 'webhook',
          provider,
          providerEventId: normalized.providerEventId,
          providerPaymentId: normalized.providerPaymentId,
          duplicate: true,
        });

        return {
          success: true,
          duplicate: true,
          provider,
          providerEventId: normalized.providerEventId,
          paymentId: existing?.paymentId,
          status: existing?.status ?? 'PROCESSED',
          fraudRisk: this.publicFraudRisk(fraudRisk),
        };
      }

      throw error;
    }

    try {
      const payment = await this.applyWebhookPaymentStatus(normalized);
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          paymentId: payment?.id,
          providerPaymentId:
            normalized.providerPaymentId ?? payment?.providerPaymentId,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

      if (normalized.status === 'PAID' && payment) {
        this.emitPaymentApproved(payment);
      }

      return {
        success: true,
        duplicate: false,
        provider,
        providerEventId: normalized.providerEventId,
        status: payment?.status ?? normalized.status,
        fraudRisk: this.publicFraudRisk(webhookFraudRisk),
        payment: payment ? this.toPublicPayment(payment) : undefined,
      };
    } catch (error) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: 'FAILED',
          processedAt: new Date(),
        },
      });

      throw error;
    }
  }

  async release(id: string, data: any = {}) {
    const payment = await this.findPaymentByIdentifier(id);

    if (!payment) {
      return {
        success: false,
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    if (payment.status === 'RELEASED') {
      return {
        success: true,
        idempotent: true,
        payment: this.toPublicPayment(payment),
      };
    }

    if (payment.status === 'REFUNDED' || payment.status === 'CANCELED') {
      throw new BadRequestException('Pagamento nao pode ser liberado neste status');
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        include: { order: true },
      });

      if (!current) {
        throw new BadRequestException('Pagamento nao encontrado');
      }

      if (current.status === 'RELEASED') {
        return {
          success: true,
          idempotent: true,
          payment: this.toPublicPayment(current),
        };
      }

      const metadata = this.readMetadata(current.metadata);
      const professionalId =
        this.readString(metadata.professionalId) ??
        this.readString(current.order?.professionalId);
      const professionalAmount = this.paymentProfessionalAmount(current);
      const beforeWallet = professionalId
        ? await this.ensureWallet(tx, professionalId)
        : null;
      let walletTransaction: any;

      if (professionalId && professionalAmount > 0) {
        const before = this.readWalletBalances(beforeWallet);
        const updatedWallet = await tx.wallet.update({
          where: { userId: professionalId },
          data: {
            availableBalance: this.roundCurrency(
              before.availableBalance + professionalAmount,
            ),
            escrowBalance: this.roundCurrency(
              Math.max(0, before.escrowBalance - professionalAmount),
            ),
            balance: this.roundCurrency(
              before.availableBalance +
                professionalAmount +
                Math.max(0, before.escrowBalance - professionalAmount),
            ),
          },
        });

        walletTransaction = await tx.walletTransaction.create({
          data: {
            userId: professionalId,
            orderId: current.orderId,
            type: 'PAYMENT_RELEASE',
            amount: professionalAmount,
            status: 'COMPLETED',
            source: 'PAYMENT',
            metadata: this.cleanMetadata({
              paymentId: current.id,
              provider: current.provider,
              commission: Number(current.commission ?? 0),
              withdrawable: true,
              reason: this.readString(data?.reason),
              balanceBefore: before,
              balanceAfter: this.readWalletBalances(updatedWallet),
            }),
          },
        });
      }

      await tx.escrow.updateMany({
        where: { serviceOrderId: current.orderId },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
        },
      });

      const updated = await tx.payment.update({
        where: { id: current.id },
        data: {
          status: 'RELEASED',
          escrowStatus: 'RELEASED',
          releasedAt: new Date(),
          metadata: this.cleanMetadata({
            ...metadata,
            professionalId,
            professionalAmount,
            releaseReason: this.readString(data?.reason),
          }),
        },
      });

      await this.auditPayment(tx, {
        paymentId: updated.id,
        orderId: updated.orderId,
        provider: updated.provider,
        action: 'PAYMENT_RELEASED',
        status: 'RELEASED',
        amount: professionalAmount,
        metadata: {
          walletTransactionId: walletTransaction?.id,
          commission: Number(updated.commission ?? 0),
        },
      });

      return {
        success: true,
        payment: this.toPublicPayment(updated),
        walletCredit: professionalId
          ? {
              userId: professionalId,
              amount: professionalAmount,
              withdrawable: true,
              transactionId: walletTransaction?.id,
            }
          : undefined,
        platformRevenue: Number(updated.commission ?? 0),
      };
    });

    if (result.success && result.payment) {
      this.emitPaymentReleased(result.payment);
    }

    return result;
  }

  async releaseForOrder(orderId: string) {
    const normalizedOrderId = this.requireString(orderId, 'orderId obrigatorio');
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId: normalizedOrderId,
        status: { in: ['ESCROW_HELD', 'PAID', 'SPLIT_DONE'] as any },
        escrowStatus: 'HELD',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      return {
        success: true,
        released: false,
        reason: 'NO_HELD_PAYMENT',
        orderId: normalizedOrderId,
      };
    }

    const result = await this.release(payment.id, {
      reason: 'ORDER_COMPLETED',
    });

    return {
      ...result,
      released: result.success,
      orderId: normalizedOrderId,
    };
  }

  async refund(id: string, data: any = {}) {
    const payment = await this.findPaymentByIdentifier(id);

    if (!payment) {
      return {
        success: false,
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    if (payment.status === 'RELEASED') {
      throw new BadRequestException(
        'Pagamento liberado exige estorno operacional fora do escrow',
      );
    }

    const refundAmount = Math.min(
      this.readAmount(data?.refundAmount ?? payment.amount),
      Number(payment.amount ?? 0),
    );

    return this.prisma.$transaction(async (tx: any) => {
      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        include: { order: true },
      });

      if (!current) {
        throw new BadRequestException('Pagamento nao encontrado');
      }

      if (current.status === 'REFUNDED') {
        return {
          success: true,
          idempotent: true,
          payment: this.toPublicPayment(current),
        };
      }

      const metadata = this.readMetadata(current.metadata);
      const professionalId =
        this.readString(metadata.professionalId) ??
        this.readString(current.order?.professionalId);
      const professionalAmount = this.paymentProfessionalAmount(current);

      if (professionalId && professionalAmount > 0) {
        const wallet = await this.ensureWallet(tx, professionalId);
        const before = this.readWalletBalances(wallet);
        const escrowDebit = Math.min(before.escrowBalance, professionalAmount);
        const updatedWallet = await tx.wallet.update({
          where: { userId: professionalId },
          data: {
            availableBalance: before.availableBalance,
            escrowBalance: this.roundCurrency(before.escrowBalance - escrowDebit),
            balance: this.roundCurrency(
              before.availableBalance + before.escrowBalance - escrowDebit,
            ),
          },
        });

        if (escrowDebit > 0) {
          await tx.walletTransaction.create({
            data: {
              userId: professionalId,
              orderId: current.orderId,
              type: 'ESCROW_REFUND',
              amount: escrowDebit,
              status: 'COMPLETED',
              source: 'PAYMENT',
              metadata: this.cleanMetadata({
                paymentId: current.id,
                refundAmount,
                balanceBefore: before,
                balanceAfter: this.readWalletBalances(updatedWallet),
              }),
            },
          });
        }
      }

      await tx.escrow.updateMany({
        where: { serviceOrderId: current.orderId },
        data: {
          status: 'REFUNDED',
        },
      });

      const status = refundAmount >= Number(current.amount ?? 0)
        ? 'REFUNDED'
        : 'PARTIAL_REFUND';
      const updated = await tx.payment.update({
        where: { id: current.id },
        data: {
          status,
          escrowStatus: 'REFUNDED',
          refundedAt: new Date(),
          metadata: this.cleanMetadata({
            ...metadata,
            refundAmount,
            refundReason: this.readString(data?.reason),
          }),
        },
      });

      await this.auditPayment(tx, {
        paymentId: updated.id,
        orderId: updated.orderId,
        provider: updated.provider,
        action: status === 'REFUNDED' ? 'PAYMENT_REFUNDED' : 'PAYMENT_PARTIAL_REFUND',
        status,
        amount: refundAmount,
      });

      return {
        success: true,
        payment: this.toPublicPayment(updated),
        clientRefund: {
          userId:
            this.readString(metadata.clientId) ??
            this.readString(current.order?.clientId),
          amount: refundAmount,
        },
      };
    });
  }

  async split(id: string) {
    const payment = await this.findPaymentByIdentifier(id);

    if (!payment) {
      return {
        success: false,
        error: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento nao encontrado',
      };
    }

    const split = this.publicSplit(payment);
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: payment.status === 'RELEASED' ? payment.status : 'SPLIT_DONE',
        metadata: this.cleanMetadata({
          ...this.readMetadata(payment.metadata),
          split,
        }),
      },
    });

    await this.auditPayment(this.prisma, {
      paymentId: updated.id,
      orderId: updated.orderId,
      provider: updated.provider,
      action: 'PAYMENT_SPLIT_CALCULATED',
      status: updated.status,
      amount: Number(updated.amount ?? 0),
      metadata: split,
    });

    return {
      success: true,
      split,
      payment: this.toPublicPayment(updated),
    };
  }

  async findAll() {
    const payments = await this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return payments.map((payment) => this.toPublicPayment(payment));
  }

  async findOne(id: string) {
    const payment = await this.findPaymentByIdentifier(id);

    return payment ? this.toPublicPayment(payment) : null;
  }

  async getOrderStatus(orderId: string) {
    const normalizedOrderId = this.requireString(orderId, 'orderId obrigatorio');
    const payments = await this.prisma.payment.findMany({
      where: { orderId: normalizedOrderId },
      orderBy: { createdAt: 'desc' },
    });

    const latest = payments[0];

    return {
      success: true,
      orderId: normalizedOrderId,
      status: latest?.status ?? 'NO_PAYMENT',
      escrowStatus: latest?.escrowStatus,
      payment: latest ? this.toPublicPayment(latest) : undefined,
      history: payments.map((payment) => this.toPublicPayment(payment)),
    };
  }

  async findPaymentAudits(paymentId: string) {
    const normalizedPaymentId = this.requireString(
      paymentId,
      'paymentId obrigatorio',
    );

    return this.prisma.paymentAudit.findMany({
      where: { paymentId: normalizedPaymentId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async resolveCheckoutInput(body: any): Promise<CheckoutInput> {
    const orderId = this.requireString(body?.orderId, 'orderId obrigatorio');
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id: orderId },
      include: {
        client: true,
        professional: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Ordem nao encontrada para pagamento');
    }

    const amount = this.requireAmount(body?.amount ?? order.price);
    const commission = this.roundCurrency(amount * this.platformCommissionRate);
    const professionalAmount = this.roundCurrency(amount - commission);

    return {
      orderId,
      provider: this.normalizeProvider(body?.provider ?? 'MERCADO_PAGO'),
      amount,
      commission,
      professionalAmount,
      title: this.readString(body?.title) ?? order.title,
      description:
        this.readString(body?.description) ??
        order.description ??
        'Pagamento BoraServico',
      clientId: order.clientId,
      professionalId:
        this.readString(body?.professionalId) ??
        this.readString(order.professionalId),
      body: this.readMetadata(body),
    };
  }

  private async createProviderCheckout(
    input: CheckoutInput,
    paymentId: string,
  ): Promise<ProviderCheckoutResult> {
    if (input.provider === 'MERCADO_PAGO') {
      return this.createMercadoPagoCheckout(input, paymentId);
    }

    if (input.provider === 'PAGARME') {
      return this.createPagarmeCheckout(input, paymentId);
    }

    throw new BadRequestException('Provider nao possui checkout externo');
  }

  private async createMercadoPagoCheckout(
    input: CheckoutInput,
    paymentId: string,
  ): Promise<ProviderCheckoutResult> {
    const accessToken = getMercadoPagoAccessToken();

    if (!accessToken) {
      throw new BadRequestException('Mercado Pago nao configurado');
    }

    const apiUrl = getPublicApiUrl();
    const successUrl = readEnv('PAYMENT_SUCCESS_URL');
    const failureUrl = readEnv('PAYMENT_FAILURE_URL');
    const pendingUrl = readEnv('PAYMENT_PENDING_URL');
    const payload: Record<string, any> = {
      items: [
        {
          id: input.orderId,
          title: input.title,
          description: input.description,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: input.amount,
        },
      ],
      external_reference: input.orderId,
      metadata: {
        paymentId,
        orderId: input.orderId,
        clientId: input.clientId,
        professionalId: input.professionalId,
        commission: input.commission,
        professionalAmount: input.professionalAmount,
      },
    };

    if (apiUrl) {
      payload.notification_url = `${apiUrl.replace(/\/$/, '')}/payments-webhook/mercado-pago`;
    }

    if (successUrl || failureUrl || pendingUrl) {
      payload.back_urls = this.cleanMetadata({
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      });
    }

    if (successUrl) {
      payload.auto_return = 'approved';
    }

    if (readEnv('MERCADO_PAGO_MARKETPLACE_FEE_ENABLED') === 'true') {
      payload.marketplace_fee = input.commission;
    }

    const response = await axios.post(
      'https://api.mercadopago.com/checkout/preferences',
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    return {
      providerPaymentId: this.requireString(
        response.data?.id,
        'Mercado Pago nao retornou preferencia',
      ),
      checkoutUrl:
        this.readString(response.data?.init_point) ??
        this.readString(response.data?.sandbox_init_point),
      providerStatus: 'PREFERENCE_CREATED',
      raw: response.data,
    };
  }

  private async createPagarmeCheckout(
    input: CheckoutInput,
    paymentId: string,
  ): Promise<ProviderCheckoutResult> {
    const apiKey = getPagarmeApiKey();

    if (!apiKey) {
      throw new BadRequestException('Pagar.me nao configurado');
    }

    const customer = this.readMetadata(input.body.customer);
    const paymentMethod =
      this.readString(input.body.paymentMethod)?.toLowerCase() ?? 'pix';
    const payload: Record<string, any> = {
      code: input.orderId,
      customer: {
        name: this.readString(customer.name) ?? 'Cliente BoraServico',
        email: this.readString(customer.email) ?? `cliente-${input.clientId}@boraservico.app`,
        type: this.readString(customer.type) ?? 'individual',
        document: this.readString(customer.document),
      },
      items: [
        {
          amount: this.toCents(input.amount),
          description: input.title,
          quantity: 1,
          code: input.orderId,
        },
      ],
      payments: [
        this.cleanMetadata({
          payment_method: paymentMethod,
          pix: paymentMethod === 'pix'
            ? {
                expires_in: Number(input.body.pixExpiresIn ?? 3600),
              }
            : undefined,
          credit_card:
            paymentMethod === 'credit_card'
              ? this.readMetadata(input.body.creditCard)
              : undefined,
          metadata: {
            paymentId,
            orderId: input.orderId,
            clientId: input.clientId,
            professionalId: input.professionalId,
          },
        }),
      ],
      metadata: {
        paymentId,
        orderId: input.orderId,
        commission: input.commission,
        professionalAmount: input.professionalAmount,
      },
    };
    const recipientId =
      this.readString(input.body.pagarmeRecipientId) ?? getPagarmeRecipientId();

    if (recipientId) {
      payload.payments[0].split = [
        {
          amount: this.toCents(input.professionalAmount),
          recipient_id: recipientId,
          type: 'flat',
          options: {
            liable: true,
            charge_processing_fee: true,
            charge_remainder_fee: true,
          },
        },
      ];
    }

    const response = await axios.post(
      'https://api.pagar.me/core/v5/orders',
      payload,
      {
        auth: {
          username: apiKey,
          password: '',
        },
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    return {
      providerPaymentId: this.requireString(
        response.data?.id,
        'Pagar.me nao retornou pedido',
      ),
      checkoutUrl:
        this.readString(response.data?.checkouts?.[0]?.payment_url) ??
        this.readString(response.data?.charges?.[0]?.last_transaction?.url) ??
        this.readString(
          response.data?.charges?.[0]?.last_transaction?.qr_code_url,
        ),
      providerStatus: this.readString(response.data?.status),
      raw: response.data,
    };
  }

  private async normalizeWebhookPaymentData(
    provider: Provider,
    body: any,
    query: Record<string, any>,
  ): Promise<WebhookPaymentData> {
    const raw = this.readMetadata(body);
    const providerPaymentId =
      this.readString(query?.['data.id']) ??
      this.readString(query?.id) ??
      this.readString(raw?.data?.id) ??
      this.readString(raw?.id) ??
      this.readString(raw?.charge?.id) ??
      this.readString(raw?.order?.id);
    const eventType =
      this.readString(raw?.type) ??
      this.readString(raw?.event) ??
      this.readString(raw?.action) ??
      'payment.updated';
    const remote = providerPaymentId
      ? await this.fetchProviderPayment(provider, providerPaymentId)
      : null;
    const remoteMetadata = this.readMetadata(remote?.metadata);
    const orderId =
      this.readString(raw?.external_reference) ??
      this.readString(raw?.data?.external_reference) ??
      this.readString(raw?.orderId) ??
      this.readString(remote?.external_reference) ??
      this.readString(remoteMetadata.orderId) ??
      this.readString(remote?.code);
    const providerStatus =
      this.readString(remote?.status) ??
      this.readString(raw?.status) ??
      this.readString(raw?.data?.status);
    const eventId =
      this.readString(raw?.event_id) ??
      this.readString(raw?.notification_id) ??
      this.readString(raw?.id && raw?.type ? `${raw.type}:${raw.id}` : undefined) ??
      `${eventType}:${providerPaymentId ?? 'sem-id'}:${this.sha256(JSON.stringify(raw)).slice(0, 16)}`;
    const paidAt =
      this.readDate(remote?.date_approved) ??
      this.readDate(remote?.paid_at) ??
      this.readDate(raw?.paidAt);
    const amount =
      this.readAmount(remote?.transaction_amount) ||
      this.readAmount(remote?.amount) ||
      this.readAmount(raw?.amount);

    return {
      provider,
      providerPaymentId,
      providerEventId: eventId,
      status: this.normalizeProviderStatus(provider, providerStatus, eventType),
      providerStatus,
      orderId,
      amount: amount > 0 ? amount : undefined,
      paidAt,
      raw: {
        body: raw,
        providerPayment: remote,
      },
    };
  }

  private async fetchProviderPayment(provider: Provider, providerPaymentId: string) {
    try {
      if (provider === 'MERCADO_PAGO' && getMercadoPagoAccessToken()) {
        const response = await axios.get(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(providerPaymentId)}`,
          {
            headers: {
              Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
            },
            timeout: 10000,
          },
        );

        return response.data;
      }

      if (provider === 'PAGARME' && getPagarmeApiKey()) {
        const response = await axios.get(
          `https://api.pagar.me/core/v5/charges/${encodeURIComponent(providerPaymentId)}`,
          {
            auth: {
              username: getPagarmeApiKey() as string,
              password: '',
            },
            timeout: 10000,
          },
        );

        return response.data;
      }
    } catch {
      return null;
    }

    return null;
  }

  private async applyWebhookPaymentStatus(data: WebhookPaymentData) {
    return this.prisma.$transaction(async (tx: any) => {
      let payment = await this.findPaymentForWebhook(tx, data);

      if (!payment && data.orderId) {
        const order = await tx.serviceOrder.findUnique({
          where: { id: data.orderId },
        });

        if (order) {
          const amount = data.amount ?? Number(order.price ?? 0);
          const commission = this.roundCurrency(
            amount * this.platformCommissionRate,
          );

          payment = await tx.payment.create({
            data: {
              orderId: order.id,
              provider: data.provider as any,
              providerPaymentId: data.providerPaymentId,
              status: data.status,
              amount,
              commission,
              escrowStatus: 'HELD',
              paidAt: data.status === 'PAID' ? data.paidAt ?? new Date() : undefined,
              metadata: this.cleanMetadata({
                clientId: order.clientId,
                professionalId: order.professionalId,
                professionalAmount: this.roundCurrency(amount - commission),
                providerStatus: data.providerStatus,
                providerRaw: this.safeProviderPayload(data.raw),
              }),
            },
          });
        }
      }

      if (!payment) {
        await this.auditPayment(tx, {
          provider: data.provider,
          action: 'WEBHOOK_WITHOUT_LOCAL_PAYMENT',
          status: data.status,
          amount: data.amount,
          metadata: {
            providerPaymentId: data.providerPaymentId,
            orderId: data.orderId,
          },
        });

        return null;
      }

      const metadata = this.readMetadata(payment.metadata);
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId:
            data.providerPaymentId ?? payment.providerPaymentId,
          status: data.status,
          paidAt:
            data.status === 'PAID'
              ? data.paidAt ?? payment.paidAt ?? new Date()
              : payment.paidAt,
          refundedAt:
            data.status === 'REFUNDED'
              ? new Date()
              : payment.refundedAt,
          metadata: this.cleanMetadata({
            ...metadata,
            providerStatus: data.providerStatus,
            providerWebhookStatus: data.status,
            providerRaw: this.safeProviderPayload(data.raw),
          }),
        },
      });

      await this.auditPayment(tx, {
        paymentId: updated.id,
        orderId: updated.orderId,
        provider: updated.provider,
        action: 'WEBHOOK_PAYMENT_STATUS',
        status: data.status,
        amount: Number(updated.amount ?? 0),
        metadata: {
          providerPaymentId: data.providerPaymentId,
          providerStatus: data.providerStatus,
          providerEventId: data.providerEventId,
        },
      });

      if (data.status === 'PAID') {
        const settled = await this.settleEscrowHoldInTransaction(tx, updated, {
          source: 'WEBHOOK',
          providerEventId: data.providerEventId,
        });

        return settled;
      }

      if (data.status === 'REFUNDED') {
        const refundMetadata = this.readMetadata(updated.metadata);
        const order =
          updated.order ??
          (await tx.serviceOrder.findUnique({ where: { id: updated.orderId } }));
        const professionalId =
          this.readString(refundMetadata.professionalId) ??
          this.readString(order?.professionalId);
        const professionalAmount = this.paymentProfessionalAmount(updated);

        if (professionalId && professionalAmount > 0) {
          const existingRefund = await tx.walletTransaction.findFirst({
            where: {
              userId: professionalId,
              orderId: updated.orderId,
              type: 'ESCROW_REFUND',
              source: 'PAYMENT',
            },
          });

          if (!existingRefund) {
            const wallet = await this.ensureWallet(tx, professionalId);
            const before = this.readWalletBalances(wallet);
            const escrowDebit = Math.min(
              before.escrowBalance,
              professionalAmount,
            );

            if (escrowDebit > 0) {
              const updatedWallet = await tx.wallet.update({
                where: { userId: professionalId },
                data: {
                  availableBalance: before.availableBalance,
                  escrowBalance: this.roundCurrency(
                    before.escrowBalance - escrowDebit,
                  ),
                  balance: this.roundCurrency(
                    before.availableBalance + before.escrowBalance - escrowDebit,
                  ),
                },
              });

              await tx.walletTransaction.create({
                data: {
                  userId: professionalId,
                  orderId: updated.orderId,
                  type: 'ESCROW_REFUND',
                  amount: escrowDebit,
                  status: 'COMPLETED',
                  source: 'PAYMENT',
                  metadata: this.cleanMetadata({
                    paymentId: updated.id,
                    providerEventId: data.providerEventId,
                    balanceBefore: before,
                    balanceAfter: this.readWalletBalances(updatedWallet),
                  }),
                },
              });
            }
          }
        }

        const refunded = await tx.payment.update({
          where: { id: updated.id },
          data: {
            status: 'REFUNDED',
            escrowStatus: 'REFUNDED',
            refundedAt: new Date(),
          },
        });

        await tx.escrow.updateMany({
          where: { serviceOrderId: refunded.orderId },
          data: { status: 'REFUNDED' },
        });

        return refunded;
      }

      return updated;
    });
  }

  private async findPaymentForWebhook(tx: any, data: WebhookPaymentData) {
    const clauses: any[] = [];

    if (data.providerPaymentId) {
      clauses.push({
        provider: data.provider,
        providerPaymentId: data.providerPaymentId,
      });
    }

    if (data.orderId) {
      clauses.push({
        provider: data.provider,
        orderId: data.orderId,
      });
    }

    if (clauses.length === 0) {
      return null;
    }

    return tx.payment.findFirst({
      where: { OR: clauses },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async settleEscrowHold(paymentId: string, metadata: Record<string, any>) {
    return this.prisma.$transaction(async (tx: any) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { order: true },
      });

      if (!payment) {
        throw new BadRequestException('Pagamento nao encontrado');
      }

      const settled = await this.settleEscrowHoldInTransaction(
        tx,
        payment,
        metadata,
      );

      return {
        success: true,
        payment: this.toPublicPayment(settled),
      };
    });
  }

  private async settleEscrowHoldInTransaction(
    tx: any,
    payment: any,
    extraMetadata: Record<string, any> = {},
  ) {
    if (payment.status === 'ESCROW_HELD' || payment.status === 'RELEASED') {
      return payment;
    }

    const order =
      payment.order ??
      (await tx.serviceOrder.findUnique({ where: { id: payment.orderId } }));
    const metadata = this.readMetadata(payment.metadata);
    const clientId =
      this.readString(metadata.clientId) ?? this.readString(order?.clientId);
    const professionalId =
      this.readString(metadata.professionalId) ??
      this.readString(order?.professionalId);
    const professionalAmount = this.paymentProfessionalAmount(payment);

    await tx.escrow.upsert({
      where: { serviceOrderId: payment.orderId },
      update: {
        clientId,
        amount: Number(payment.amount ?? 0),
        status: 'HELD',
        releasedAt: null,
      },
      create: {
        serviceOrderId: payment.orderId,
        clientId,
        amount: Number(payment.amount ?? 0),
        status: 'HELD',
      },
    });

    if (professionalId && professionalAmount > 0) {
      const existingHold = await tx.walletTransaction.findFirst({
        where: {
          userId: professionalId,
          orderId: payment.orderId,
          type: 'ESCROW_HOLD',
          source: 'PAYMENT',
        },
      });

      if (!existingHold) {
        const wallet = await this.ensureWallet(tx, professionalId);
        const before = this.readWalletBalances(wallet);
        const updatedWallet = await tx.wallet.update({
          where: { userId: professionalId },
          data: {
            availableBalance: before.availableBalance,
            escrowBalance: this.roundCurrency(
              before.escrowBalance + professionalAmount,
            ),
            balance: this.roundCurrency(
              before.availableBalance + before.escrowBalance + professionalAmount,
            ),
          },
        });

        await tx.walletTransaction.create({
          data: {
            userId: professionalId,
            orderId: payment.orderId,
            type: 'ESCROW_HOLD',
            amount: professionalAmount,
            status: 'COMPLETED',
            source: 'PAYMENT',
            metadata: this.cleanMetadata({
              paymentId: payment.id,
              provider: payment.provider,
              totalAmount: Number(payment.amount ?? 0),
              commission: Number(payment.commission ?? 0),
              balanceBefore: before,
              balanceAfter: this.readWalletBalances(updatedWallet),
              ...extraMetadata,
            }),
          },
        });
      }
    }

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'ESCROW_HELD',
        escrowStatus: 'HELD',
        paidAt: payment.paidAt ?? new Date(),
        metadata: this.cleanMetadata({
          ...metadata,
          clientId,
          professionalId,
          professionalAmount,
          split: this.publicSplit(payment),
          escrowHeldAt: new Date().toISOString(),
          ...extraMetadata,
        }),
      },
    });

    await this.auditPayment(tx, {
      paymentId: updated.id,
      orderId: updated.orderId,
      provider: updated.provider,
      action: 'ESCROW_HELD',
      status: 'ESCROW_HELD',
      amount: Number(updated.amount ?? 0),
      metadata: {
        professionalId,
        professionalAmount,
        commission: Number(updated.commission ?? 0),
      },
    });

    return updated;
  }

  private verifyWebhookSignature(
    provider: Provider,
    body: any,
    headers: Record<string, any>,
    rawBody?: Buffer | string,
    query: Record<string, any> = {},
  ) {
    const raw = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : rawBody ?? JSON.stringify(body ?? {});

    if (provider === 'MERCADO_PAGO') {
      const secret = getMercadoPagoWebhookSecret();

      if (!secret) {
        throw new UnauthorizedException('Mercado Pago webhook secret ausente');
      }

      const signature = this.header(headers, 'x-signature');
      const requestId = this.header(headers, 'x-request-id');
      const parts = this.parseSignatureParts(signature);
      const ts = parts.ts;
      const v1 = parts.v1 ?? parts.sha256;
      const dataId =
        this.readString(query?.['data.id']) ??
        this.readString(query?.id) ??
        this.readString(body?.data?.id) ??
        this.readString(body?.id);
      const candidates = [
        dataId && requestId && ts
          ? `id:${dataId};request-id:${requestId};ts:${ts};`
          : undefined,
        raw,
        JSON.stringify(body ?? {}),
      ].filter(Boolean) as string[];

      if (!v1 || !this.anyHmacMatches(secret, candidates, v1)) {
        throw new UnauthorizedException('Assinatura Mercado Pago invalida');
      }

      return this.sha256(signature ?? '');
    }

    const secret = getPagarmeWebhookSecret();

    if (!secret) {
      throw new UnauthorizedException('Pagar.me webhook secret ausente');
    }

    const signature =
      this.header(headers, 'x-hub-signature-256') ??
      this.header(headers, 'x-pagarme-signature');
    const expected = signature?.replace(/^sha256=/i, '');

    if (
      !expected ||
      !this.anyHmacMatches(secret, [raw, JSON.stringify(body ?? {})], expected)
    ) {
      throw new UnauthorizedException('Assinatura Pagar.me invalida');
    }

    return this.sha256(signature ?? '');
  }

  private normalizeProviderStatus(
    provider: Provider,
    status?: string,
    eventType?: string,
  ): PaymentStatus {
    const value = this.readString(status)?.toLowerCase();
    const event = this.readString(eventType)?.toLowerCase() ?? '';

    if (provider === 'MERCADO_PAGO') {
      if (value === 'approved' || value === 'accredited') {
        return 'PAID';
      }

      if (value === 'authorized') {
        return 'AUTHORIZED';
      }

      if (value === 'refunded') {
        return 'REFUNDED';
      }

      if (value === 'cancelled' || value === 'canceled') {
        return 'CANCELED';
      }

      if (value === 'rejected' || value === 'charged_back') {
        return 'FAILED';
      }
    }

    if (provider === 'PAGARME') {
      if (['paid', 'captured'].includes(value ?? '') || event.includes('paid')) {
        return 'PAID';
      }

      if (value === 'refunded' || event.includes('refunded')) {
        return 'REFUNDED';
      }

      if (value === 'canceled' || value === 'cancelled') {
        return 'CANCELED';
      }

      if (value === 'failed') {
        return 'FAILED';
      }
    }

    return 'PENDING';
  }

  private publicSplit(payment: any) {
    const amount = Number(payment.amount ?? 0);
    const commission = Number(payment.commission ?? 0);
    const professionalAmount = this.paymentProfessionalAmount(payment);

    return {
      total: this.roundCurrency(amount),
      platformCommissionRate: this.platformCommissionRate,
      platformFee: this.roundCurrency(commission),
      commission: this.roundCurrency(commission),
      professionalAmount,
      escrowAmount: this.roundCurrency(amount),
    };
  }

  private buildSplit(input: CheckoutInput) {
    return {
      total: input.amount,
      platformCommissionRate: this.platformCommissionRate,
      platformFee: input.commission,
      commission: input.commission,
      professionalAmount: input.professionalAmount,
      escrowAmount: input.amount,
    };
  }

  private toPublicPayment(payment: any) {
    const metadata = this.readMetadata(payment.metadata);
    const amount = Number(payment.amount ?? 0);
    const commission = Number(payment.commission ?? 0);
    const professionalAmount = this.roundCurrency(
      Number(metadata.professionalAmount ?? amount - commission),
    );

    return {
      success: true,
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      paymentStatus: payment.status,
      escrowStatus: payment.escrowStatus,
      amount,
      commission,
      platformFee: commission,
      professionalAmount,
      refundAmount: Number(metadata.refundAmount ?? 0),
      split: metadata.split ?? this.publicSplit(payment),
      checkoutUrl: this.readString(metadata.checkoutUrl) ?? null,
      checkoutReady: Boolean(metadata.checkoutReady),
      requiresProviderConfiguration: Boolean(
        metadata.requiresProviderConfiguration,
      ),
      providerConfigured: Boolean(metadata.providerConfigured),
      fraudRisk: metadata.fraudRisk,
      paidAt: payment.paidAt,
      releasedAt: payment.releasedAt,
      refundedAt: payment.refundedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private emitPaymentApproved(payment: any) {
    const publicPayment = this.toPublicPayment(payment);

    RealtimeGateway.emitOperational('payment-approved', {
      orderId: publicPayment.orderId,
      paymentId: publicPayment.id,
      status: publicPayment.status,
      amount: publicPayment.amount,
      escrowStatus: publicPayment.escrowStatus,
      message: 'Pagamento aprovado',
      timestamp: new Date().toISOString(),
    });

    void this.pushRealService
      .notifyOrderEvent('PAYMENT_APPROVED', publicPayment)
      .catch(() => undefined);
  }

  private emitPaymentReleased(payment: any) {
    const publicPayment = this.toPublicPayment(payment);

    RealtimeGateway.emitOperational('payment-released', {
      orderId: publicPayment.orderId,
      paymentId: publicPayment.id,
      status: publicPayment.status,
      amount: publicPayment.amount,
      escrowStatus: publicPayment.escrowStatus,
      releasedAt: publicPayment.releasedAt,
      message: 'Pagamento liberado',
      timestamp: new Date().toISOString(),
    });

    void this.pushRealService
      .notifyOrderEvent('PAYMENT_RELEASED', publicPayment)
      .catch(() => undefined);
  }

  private async scorePayment(data: any) {
    try {
      return await this.fraudService.analyzePayment(data, {
        userId: data?.clientId,
      });
    } catch {
      return undefined;
    }
  }

  private async scoreWebhook(data: any) {
    try {
      return await this.fraudService.analyzeWebhook(data);
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

  private async auditPayment(tx: any, input: Record<string, any>) {
    return tx.paymentAudit.create({
      data: {
        paymentId: this.readString(input.paymentId),
        orderId: this.readString(input.orderId),
        provider: input.provider,
        action: this.requireString(input.action, 'action obrigatoria'),
        status: input.status,
        amount: input.amount,
        metadata: this.cleanMetadata(input.metadata ?? {}),
      },
    });
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

  private async findPaymentByIdentifier(id: string) {
    const identifier = this.requireString(id, 'paymentId obrigatorio');

    return this.prisma.payment.findFirst({
      where: {
        OR: [{ id: identifier }, { providerPaymentId: identifier }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private paymentProfessionalAmount(payment: any) {
    const metadata = this.readMetadata(payment.metadata);
    const amount = Number(payment.amount ?? 0);
    const commission = Number(payment.commission ?? 0);

    return this.roundCurrency(
      Number(metadata.professionalAmount ?? amount - commission),
    );
  }

  private isProviderConfigured(provider: Provider) {
    if (provider === 'MERCADO_PAGO') {
      return Boolean(getMercadoPagoAccessToken());
    }

    if (provider === 'PAGARME') {
      return Boolean(getPagarmeApiKey());
    }

    return false;
  }

  private normalizeProvider(value: any): Provider {
    const provider = this.readString(value)
      ?.toUpperCase()
      .replace(/[.\-\s]+/g, '_');

    if (provider === 'PAGARME' || provider === 'PAGAR_ME') {
      return 'PAGARME';
    }

    if (
      provider === 'MP' ||
      provider === 'MERCADOPAGO' ||
      provider === 'MERCADO_PAGO'
    ) {
      return 'MERCADO_PAGO';
    }

    const allowed: Provider[] = [
      'MERCADO_PAGO',
      'PAGARME',
      'PIX',
      'STRIPE',
      'MANUAL',
    ];

    return allowed.includes(provider as Provider)
      ? (provider as Provider)
      : 'MERCADO_PAGO';
  }

  private parseSignatureParts(signature?: string) {
    const parts: Record<string, string> = {};

    for (const item of signature?.split(',') ?? []) {
      const [key, value] = item.split('=');

      if (key && value) {
        parts[key.trim()] = value.trim();
      }
    }

    return parts;
  }

  private anyHmacMatches(secret: string, payloads: string[], expected: string) {
    return payloads.some((payload) =>
      this.safeCompareHex(
        createHmac('sha256', secret).update(payload).digest('hex'),
        expected,
      ),
    );
  }

  private safeCompareHex(actual: string, expected: string) {
    const normalizedActual = actual.toLowerCase();
    const normalizedExpected = expected.toLowerCase();

    if (!/^[a-f0-9]+$/.test(normalizedExpected)) {
      return false;
    }

    const actualBuffer = Buffer.from(normalizedActual, 'hex');
    const expectedBuffer = Buffer.from(normalizedExpected, 'hex');

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private header(headers: Record<string, any>, name: string) {
    const value =
      headers[name] ??
      headers[name.toLowerCase()] ??
      headers[name.toUpperCase()];

    if (Array.isArray(value)) {
      return this.readString(value[0]);
    }

    return this.readString(value);
  }

  private providerErrorMessage(error: any) {
    return (
      this.readString(error?.response?.data?.message) ??
      this.readString(error?.response?.data?.errors?.[0]?.message) ??
      this.readString(error?.message) ??
      'Falha ao criar checkout no provedor'
    );
  }

  private safeProviderPayload(value: any) {
    if (!value) {
      return undefined;
    }

    const text = JSON.stringify(value);

    if (text.length <= 12000) {
      return value;
    }

    return {
      truncated: true,
      digest: this.sha256(text),
    };
  }

  private cleanMetadata(metadata: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    );
  }

  private readMetadata(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private readWalletBalances(wallet: any) {
    const availableBalance = this.roundCurrency(
      Number(wallet?.availableBalance ?? 0),
    );
    const escrowBalance = this.roundCurrency(Number(wallet?.escrowBalance ?? 0));

    return {
      availableBalance,
      escrowBalance,
      totalBalance: this.roundCurrency(availableBalance + escrowBalance),
    };
  }

  private readString(value: any) {
    const text = value?.toString().trim();
    return text && text.length > 0 ? text : undefined;
  }

  private requireString(value: any, message: string) {
    const text = this.readString(value);

    if (!text) {
      throw new BadRequestException(message);
    }

    return text;
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

  private readDate(value: any) {
    const text = this.readString(value);

    if (!text) {
      return undefined;
    }

    const date = new Date(text);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private toCents(value: number) {
    return Math.round(value * 100);
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private isUniqueConstraintError(error: any) {
    return error?.code === 'P2002';
  }
}
