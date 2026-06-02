import 'dotenv/config';

import { Prisma, PrismaClient, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEMP_DEV_PASSWORD =
  process.env.SEED_DEV_PASSWORD ?? 'BoraServicoDev#2026';
const RESET_PASSWORDS = process.env.SEED_RESET_PASSWORDS === 'true';

const seedEmails = {
  admin: 'chrystofferson@gmail.com',
  client: 'cliente.dev@boraservico.local',
  professional: 'profissional.dev@boraservico.local',
};

const seedIds = {
  demoOrder: 'seed-order-demo-real',
  basicCleaningOrder: 'seed-order-basic-cleaning',
  basicPaintingOrder: 'seed-order-basic-painting',
  basicElectricalOrder: 'seed-order-basic-electrical',
  clientEscrowTransaction: 'seed-wallet-tx-client-escrow',
  professionalCreditTransaction: 'seed-wallet-tx-professional-credit',
  adminReferralTransaction: 'seed-wallet-tx-admin-referral',
  payment: 'seed-payment-demo-real',
  tracking: 'seed-tracking-demo-checkin',
  chatSystem: 'seed-chat-demo-system',
  chatProfessional: 'seed-chat-demo-professional',
  referralBonus: 'seed-referral-bonus-admin-professional',
};

async function main() {
  const database = assertSafeDatabaseUrl();
  const passwordHash = await bcrypt.hash(TEMP_DEV_PASSWORD, 10);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const admin = await upsertSeedUser(tx, {
      email: seedEmails.admin,
      name: 'Chrystofferson Developer Admin (seed)',
      role: UserRole.ADMIN,
      passwordHash,
      developerSeed: true,
    });

    const client = await upsertSeedUser(tx, {
      email: seedEmails.client,
      name: 'Cliente Dev BoraServico',
      role: UserRole.CLIENT,
      passwordHash,
    });

    const professional = await upsertSeedUser(tx, {
      email: seedEmails.professional,
      name: 'Profissional Dev BoraServico',
      role: UserRole.PROFESSIONAL,
      passwordHash,
    });

    await tx.wallet.upsert({
      where: { userId: client.id },
      update: {
        balance: money('249.90'),
        escrowBalance: money('189.90'),
        availableBalance: money('60.00'),
      },
      create: {
        userId: client.id,
        balance: money('249.90'),
        escrowBalance: money('189.90'),
        availableBalance: money('60.00'),
      },
    });

    await tx.wallet.upsert({
      where: { userId: professional.id },
      update: {
        balance: money('120.00'),
        escrowBalance: money('0.00'),
        availableBalance: money('120.00'),
      },
      create: {
        userId: professional.id,
        balance: money('120.00'),
        escrowBalance: money('0.00'),
        availableBalance: money('120.00'),
      },
    });

    await tx.wallet.upsert({
      where: { userId: admin.id },
      update: {
        balance: money('9.50'),
        escrowBalance: money('0.00'),
        availableBalance: money('9.50'),
      },
      create: {
        userId: admin.id,
        balance: money('9.50'),
        escrowBalance: money('0.00'),
        availableBalance: money('9.50'),
      },
    });

    const demoOrder = await tx.serviceOrder.upsert({
      where: { id: seedIds.demoOrder },
      update: {
        clientId: client.id,
        professionalId: professional.id,
        status: 'ACCEPTED',
        category: 'Limpeza residencial',
        address: 'Rua Dev Local, 100 - Sao Paulo, SP',
        title: 'Limpeza residencial demo persistida',
        description:
          'Ordem demo real criada pelo seed enterprise inicial para testar fluxo com profissional vinculado.',
        price: money('189.90'),
        acceptedAt: now,
      },
      create: {
        id: seedIds.demoOrder,
        clientId: client.id,
        professionalId: professional.id,
        status: 'ACCEPTED',
        category: 'Limpeza residencial',
        address: 'Rua Dev Local, 100 - Sao Paulo, SP',
        title: 'Limpeza residencial demo persistida',
        description:
          'Ordem demo real criada pelo seed enterprise inicial para testar fluxo com profissional vinculado.',
        price: money('189.90'),
        acceptedAt: now,
      },
    });

    await upsertBasicServiceOrders(tx, client.id);

    await tx.escrow.upsert({
      where: { serviceOrderId: demoOrder.id },
      update: {
        clientId: client.id,
        amount: money('189.90'),
        status: 'HELD',
      },
      create: {
        serviceOrderId: demoOrder.id,
        clientId: client.id,
        amount: money('189.90'),
        status: 'HELD',
      },
    });

    await tx.payment.upsert({
      where: { id: seedIds.payment },
      update: {
        orderId: demoOrder.id,
        provider: 'MANUAL',
        providerPaymentId: 'seed-local-payment-demo-real',
        status: 'ESCROW_HELD',
        amount: money('189.90'),
        commission: money('22.79'),
        escrowStatus: 'HELD',
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          provider: 'local-seed',
        },
      },
      create: {
        id: seedIds.payment,
        orderId: demoOrder.id,
        provider: 'MANUAL',
        providerPaymentId: 'seed-local-payment-demo-real',
        status: 'ESCROW_HELD',
        amount: money('189.90'),
        commission: money('22.79'),
        escrowStatus: 'HELD',
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          provider: 'local-seed',
        },
      },
    });

    await tx.walletTransaction.upsert({
      where: { id: seedIds.clientEscrowTransaction },
      update: {
        userId: client.id,
        orderId: demoOrder.id,
        type: 'ESCROW_HOLD',
        amount: money('189.90'),
        status: 'COMPLETED',
        source: 'ESCROW',
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          note: 'Valor protegido da ordem demo.',
        },
      },
      create: {
        id: seedIds.clientEscrowTransaction,
        userId: client.id,
        orderId: demoOrder.id,
        type: 'ESCROW_HOLD',
        amount: money('189.90'),
        status: 'COMPLETED',
        source: 'ESCROW',
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          note: 'Valor protegido da ordem demo.',
        },
      },
    });

    await tx.walletTransaction.upsert({
      where: { id: seedIds.professionalCreditTransaction },
      update: {
        userId: professional.id,
        orderId: demoOrder.id,
        type: 'CREDIT',
        amount: money('120.00'),
        status: 'COMPLETED',
        source: 'SYSTEM',
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          note: 'Saldo dev inicial para testar wallet profissional.',
        },
      },
      create: {
        id: seedIds.professionalCreditTransaction,
        userId: professional.id,
        orderId: demoOrder.id,
        type: 'CREDIT',
        amount: money('120.00'),
        status: 'COMPLETED',
        source: 'SYSTEM',
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          note: 'Saldo dev inicial para testar wallet profissional.',
        },
      },
    });

    const adminReferralTransaction = await tx.walletTransaction.upsert({
      where: { id: seedIds.adminReferralTransaction },
      update: {
        userId: admin.id,
        orderId: demoOrder.id,
        type: 'REFERRAL_BONUS',
        amount: money('9.50'),
        status: 'COMPLETED',
        source: 'REFERRAL',
        metadata: {
          seed: true,
          developerSeed: true,
          package: 'PACOTE_10',
          note: 'Bonus base de indicacao para admin/dev.',
        },
      },
      create: {
        id: seedIds.adminReferralTransaction,
        userId: admin.id,
        orderId: demoOrder.id,
        type: 'REFERRAL_BONUS',
        amount: money('9.50'),
        status: 'COMPLETED',
        source: 'REFERRAL',
        metadata: {
          seed: true,
          developerSeed: true,
          package: 'PACOTE_10',
          note: 'Bonus base de indicacao para admin/dev.',
        },
      },
    });

    const referral = await tx.referral.upsert({
      where: {
        referrerId_referredUserId: {
          referrerId: admin.id,
          referredUserId: professional.id,
        },
      },
      update: {
        status: 'PHASE_1',
        phase1EndAt: addMonths(now, 3),
        phase1Earned: money('9.50'),
        totalEarned: money('9.50'),
      },
      create: {
        referrerId: admin.id,
        referredUserId: professional.id,
        status: 'PHASE_1',
        phase1StartAt: now,
        phase1EndAt: addMonths(now, 3),
        phase1Earned: money('9.50'),
        totalEarned: money('9.50'),
      },
    });

    await tx.referralBonus.upsert({
      where: { id: seedIds.referralBonus },
      update: {
        referralId: referral.id,
        referrerId: admin.id,
        referredUserId: professional.id,
        orderId: demoOrder.id,
        serviceValue: money('189.90'),
        phase: 1,
        percentage: money('0.0500'),
        bonusAmount: money('9.50'),
        withdrawable: true,
        walletTransactionId: adminReferralTransaction.id,
      },
      create: {
        id: seedIds.referralBonus,
        referralId: referral.id,
        referrerId: admin.id,
        referredUserId: professional.id,
        orderId: demoOrder.id,
        serviceValue: money('189.90'),
        phase: 1,
        percentage: money('0.0500'),
        bonusAmount: money('9.50'),
        withdrawable: true,
        walletTransactionId: adminReferralTransaction.id,
      },
    });

    await tx.reputationProfile.upsert({
      where: { userId: professional.id },
      update: {
        averageRating: 4.96,
        totalReviews: 12,
        completedServices: 38,
        cancelledServices: 1,
        responseTimeScore: 98,
        reliabilityScore: 99,
        reputationScore: 98.5,
      },
      create: {
        userId: professional.id,
        averageRating: 4.96,
        totalReviews: 12,
        completedServices: 38,
        cancelledServices: 1,
        responseTimeScore: 98,
        reliabilityScore: 99,
        reputationScore: 98.5,
      },
    });

    await upsertTimeline(tx, demoOrder.id, now);

    await tx.trackingEvent.upsert({
      where: { id: seedIds.tracking },
      update: {
        orderId: demoOrder.id,
        actorId: professional.id,
        lat: -23.55052,
        lng: -46.63331,
        status: 'CHECKED_IN',
        timestamp: now,
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          source: 'local-dev',
        },
      },
      create: {
        id: seedIds.tracking,
        orderId: demoOrder.id,
        actorId: professional.id,
        lat: -23.55052,
        lng: -46.63331,
        status: 'CHECKED_IN',
        timestamp: now,
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          source: 'local-dev',
        },
      },
    });

    await tx.chatMessage.upsert({
      where: { id: seedIds.chatSystem },
      update: {
        orderId: demoOrder.id,
        senderId: admin.id,
        senderRole: 'SYSTEM',
        message: 'Seed PACOTE_10: ordem demo persistida pronta para testes.',
      },
      create: {
        id: seedIds.chatSystem,
        orderId: demoOrder.id,
        senderId: admin.id,
        senderRole: 'SYSTEM',
        message: 'Seed PACOTE_10: ordem demo persistida pronta para testes.',
      },
    });

    await tx.chatMessage.upsert({
      where: { id: seedIds.chatProfessional },
      update: {
        orderId: demoOrder.id,
        senderId: professional.id,
        senderRole: 'PROFESSIONAL',
        message: 'Estou a caminho para o atendimento demo.',
      },
      create: {
        id: seedIds.chatProfessional,
        orderId: demoOrder.id,
        senderId: professional.id,
        senderRole: 'PROFESSIONAL',
        message: 'Estou a caminho para o atendimento demo.',
      },
    });

    return {
      admin,
      client,
      professional,
      demoOrder,
      referralId: referral.id,
    };
  });

  console.log('Seed enterprise inicial criado/atualizado com sucesso.');
  console.log(`Banco: ${database}`);
  console.table([
    {
      email: result.admin.email,
      role: result.admin.role,
      marker: 'developer/admin seed',
    },
    {
      email: result.client.email,
      role: result.client.role,
      marker: 'client seed',
    },
    {
      email: result.professional.email,
      role: result.professional.role,
      marker: 'professional seed',
    },
  ]);
  console.log(`Ordem demo: ${result.demoOrder.id}`);
  console.log(`Referral base: ${result.referralId}`);
  console.log(
    RESET_PASSWORDS
      ? 'Senhas dev foram atualizadas porque SEED_RESET_PASSWORDS=true.'
      : 'Senhas existentes foram preservadas; senha temporaria aplicada apenas em usuarios criados.',
  );
}

async function upsertSeedUser(
  tx: Prisma.TransactionClient,
  data: {
    email: string;
    name: string;
    role: UserRole;
    passwordHash: string;
    developerSeed?: boolean;
  },
): Promise<User> {
  const existing = await tx.user.findUnique({
    where: { email: data.email },
  });

  if (existing) {
    return tx.user.update({
      where: { email: data.email },
      data: {
        name: data.name,
        role: data.role,
        ...(RESET_PASSWORDS ? { password: data.passwordHash } : {}),
      },
    });
  }

  return tx.user.create({
    data: {
      email: data.email,
      password: data.passwordHash,
      name: data.name,
      role: data.role,
      fcmToken: data.developerSeed ? 'developer-admin-seed' : null,
    },
  });
}

async function upsertBasicServiceOrders(
  tx: Prisma.TransactionClient,
  clientId: string,
) {
  const basicOrders = [
    {
      id: seedIds.basicCleaningOrder,
      category: 'Limpeza residencial',
      title: 'Servico basico - limpeza residencial',
      description: 'Registro dev para validar categoria de limpeza.',
      price: '120.00',
    },
    {
      id: seedIds.basicPaintingOrder,
      category: 'Pintura',
      title: 'Servico basico - pintura',
      description: 'Registro dev para validar categoria de pintura.',
      price: '250.00',
    },
    {
      id: seedIds.basicElectricalOrder,
      category: 'Eletrica',
      title: 'Servico basico - eletrica',
      description: 'Registro dev para validar categoria de eletrica.',
      price: '180.00',
    },
  ];

  for (const order of basicOrders) {
    await tx.serviceOrder.upsert({
      where: { id: order.id },
      update: {
        clientId,
        professionalId: null,
        status: 'CREATED',
        category: order.category,
        address: 'Endereco dev nao definido',
        title: order.title,
        description: order.description,
        price: money(order.price),
      },
      create: {
        id: order.id,
        clientId,
        status: 'CREATED',
        category: order.category,
        address: 'Endereco dev nao definido',
        title: order.title,
        description: order.description,
        price: money(order.price),
      },
    });
  }
}

async function upsertTimeline(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date,
) {
  const events = [
    {
      id: 'seed-timeline-demo-created',
      type: 'CREATED',
      title: 'Solicitacao enviada',
      description: 'Pedido registrado e pronto para matching.',
      state: 'COMPLETE',
      minutesOffset: -30,
      phase: 'request',
    },
    {
      id: 'seed-timeline-demo-matching',
      type: 'MATCHING_STARTED',
      title: 'IA analisando',
      description: 'Categoria, risco, preco e prioridade em validacao.',
      state: 'COMPLETE',
      minutesOffset: -20,
      phase: 'ai',
    },
    {
      id: 'seed-timeline-demo-accepted',
      type: 'PROFESSIONAL_ACCEPTED',
      title: 'Profissional encontrado',
      description: 'Profissional dev vinculado a ordem demo.',
      state: 'CURRENT',
      minutesOffset: -10,
      phase: 'match',
    },
    {
      id: 'seed-timeline-demo-route',
      type: 'PROFESSIONAL_ON_THE_WAY',
      title: 'Deslocamento',
      description: 'Tracking inicial disponivel para teste.',
      state: 'UPCOMING',
      minutesOffset: 10,
      phase: 'route',
    },
  ];

  for (const event of events) {
    const timestamp = new Date(now.getTime() + event.minutesOffset * 60_000);

    await tx.operationalTimelineEvent.upsert({
      where: { id: event.id },
      update: {
        orderId,
        type: event.type as any,
        title: event.title,
        description: event.description,
        state: event.state as any,
        timestamp,
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          phase: event.phase,
        },
      },
      create: {
        id: event.id,
        orderId,
        type: event.type as any,
        title: event.title,
        description: event.description,
        state: event.state as any,
        timestamp,
        metadata: {
          seed: true,
          package: 'PACOTE_10',
          phase: event.phase,
        },
      },
    });
  }
}

function assertSafeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    throw new Error('DATABASE_URL nao encontrada no ambiente.');
  }

  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  const database = parsed.pathname.replace(/^\//, '').toLowerCase();
  const safeLocalHosts = ['localhost', '127.0.0.1', '::1'];
  const productionHints = [
    'prod',
    'production',
    'railway',
    'render',
    'supabase',
    'neon',
    'aws',
    'rds',
    'azure',
    'gcp',
  ];
  const looksProduction =
    productionHints.some((hint) => host.includes(hint)) ||
    productionHints.some((hint) => database.includes(hint));

  if (
    (!safeLocalHosts.includes(host) || looksProduction) &&
    process.env.ALLOW_NON_LOCAL_SEED !== 'true'
  ) {
    throw new Error(
      `Seed bloqueado por seguranca para DATABASE_URL=${maskDatabaseUrl(raw)}. ` +
        'Use apenas banco local/dev ou defina ALLOW_NON_LOCAL_SEED=true conscientemente.',
    );
  }

  return maskDatabaseUrl(raw);
}

function maskDatabaseUrl(raw: string) {
  return raw.replace(/\/\/([^:@/]+):([^@/]+)@/, '//<credentials>@');
}

function money(value: string) {
  return new Prisma.Decimal(value);
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

main()
  .catch((error) => {
    console.error('Erro no seed enterprise inicial:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
