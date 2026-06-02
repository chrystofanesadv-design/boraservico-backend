import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Função para converter para número (SQLite não tem Decimal)
const money = (value: string | number) => Number(value);

// Função para converter metadata para string JSON
const toJson = (obj: any) => JSON.stringify(obj);

async function main() {
  console.log('🌱 Starting seed...');

  // Limpar dados existentes
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.paymentAudit.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.referralBonus.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.proofUpload.deleteMany();
  await prisma.trackingEvent.deleteMany();
  await prisma.operationalTimelineEvent.deleteMany();
  await prisma.escrow.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.review.deleteMany();
  await prisma.reputationProfile.deleteMany();
  await prisma.paymentRecipient.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.user.deleteMany();

  // ============================================
  // CRIAR USUÁRIOS
  // ============================================

  const admin = await prisma.user.create({
    data: {
      email: 'admin@boraservico.com',
      password: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
      name: 'Administrador',
      role: 'ADMIN',
    },
  });

  const client = await prisma.user.create({
    data: {
      email: 'cliente.fernandes@boraservico.com',
      password: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
      name: 'João Cliente',
      role: 'CLIENT',
    },
  });

  const professional = await prisma.user.create({
    data: {
      email: 'maria.profissional@boraservico.com',
      password: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
      name: 'Maria Profissional',
      role: 'PROFESSIONAL',
    },
  });

  console.log('✅ Users created');

  // ============================================
  // CRIAR CARTEIRAS
  // ============================================

  await prisma.wallet.create({
    data: {
      userId: client.id,
      balance: 249.9,
      escrowBalance: 189.9,
      availableBalance: 60.0,
    },
  });

  await prisma.wallet.create({
    data: {
      userId: professional.id,
      balance: 120.0,
      escrowBalance: 0.0,
      availableBalance: 120.0,
    },
  });

  await prisma.wallet.create({
    data: {
      userId: admin.id,
      balance: 9.5,
      escrowBalance: 0.0,
      availableBalance: 9.5,
    },
  });

  console.log('✅ Wallets created');

  // ============================================
  // CRIAR PEDIDO DE SERVIÇO
  // ============================================

  const order = await prisma.serviceOrder.create({
    data: {
      clientId: client.id,
      professionalId: professional.id,
      status: 'COMPLETED',
      category: 'Encanador',
      address: 'Rua Teste, 123 - São Paulo, SP',
      title: 'Reparo Hidráulico',
      description: 'Reparo em torneira do banheiro',
      price: 189.9,
      completedAt: new Date(),
    },
  });

  console.log('✅ ServiceOrder created');

  // ============================================
  // CRIAR ESCROW
  // ============================================

  await prisma.escrow.create({
    data: {
      serviceOrderId: order.id,
      clientId: client.id,
      amount: 189.9,
      status: 'RELEASED',
      releasedAt: new Date(),
    },
  });

  console.log('✅ Escrow created');

  // ============================================
  // CRIAR PAGAMENTO
  // ============================================

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'MANUAL',
      providerPaymentId: 'manual_payment_seed_123',
      status: 'RELEASED',
      amount: 189.9,
      commission: 18.99,
      escrowStatus: 'RELEASED',
      metadata: toJson({
        seed: true,
        package: 'boraservico',
        provider: 'manual',
      }),
      paidAt: new Date(),
      releasedAt: new Date(),
    },
  });

  console.log('✅ Payment created');

  // ============================================
  // CRIAR TRANSAÇÕES DE CARTEIRA
  // ============================================

  await prisma.walletTransaction.create({
    data: {
      userId: client.id,
      orderId: order.id,
      type: 'ESCROW_HOLD',
      amount: 189.9,
      status: 'COMPLETED',
      source: 'ORDER',
      metadata: toJson({
        seed: true,
        package: 'boraservico',
        note: 'Hold para pagamento',
      }),
    },
  });

  await prisma.walletTransaction.create({
    data: {
      userId: professional.id,
      orderId: order.id,
      type: 'PAYMENT_RELEASE',
      amount: 120.0,
      status: 'COMPLETED',
      source: 'ORDER',
      metadata: toJson({
        seed: true,
        package: 'boraservico',
        note: 'Recebimento do serviço',
      }),
    },
  });

  await prisma.walletTransaction.create({
    data: {
      userId: admin.id,
      type: 'REFERRAL_BONUS',
      amount: 9.5,
      status: 'COMPLETED',
      source: 'REFERRAL',
      metadata: toJson({
        seed: true,
        package: 'boraservico',
        note: 'Bônus de indicação',
      }),
    },
  });

  console.log('✅ WalletTransactions created');

  // ============================================
  // CRIAR INDICAÇÃO
  // ============================================

  const referral = await prisma.referral.create({
    data: {
      referrerId: admin.id,
      referredUserId: client.id,
      status: 'PHASE_1',
      phase1EndAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
      phase1Earned: 9.5,
      totalEarned: 9.5,
    },
  });

  await prisma.referralBonus.create({
    data: {
      referralId: referral.id,
      referrerId: admin.id,
      referredUserId: client.id,
      orderId: order.id,
      serviceValue: 189.9,
      phase: 1,
      percentage: 0.05,
      bonusAmount: 9.5,
      withdrawable: true,
    },
  });

  console.log('✅ Referral created');

  // ============================================
  // CRIAR TRACKING EVENTS
  // ============================================

  await prisma.trackingEvent.create({
    data: {
      orderId: order.id,
      lat: -23.5505,
      lng: -46.6333,
      actorId: professional.id,
      status: 'COMPLETED',
      metadata: toJson({ seed: true, package: 'boraservico', source: 'seed' }),
    },
  });

  console.log('✅ TrackingEvents created');

  // ============================================
  // CRIAR TIMELINE EVENTS
  // ============================================

  const timelineEvents = [
    { type: 'CREATED', title: 'Pedido Criado', state: 'COMPLETE' },
    {
      type: 'MATCHING_STARTED',
      title: 'Busca de Profissional',
      state: 'COMPLETE',
    },
    {
      type: 'PROFESSIONAL_ACCEPTED',
      title: 'Profissional Aceito',
      state: 'COMPLETE',
    },
    {
      type: 'PROFESSIONAL_ON_THE_WAY',
      title: 'Profissional a Caminho',
      state: 'COMPLETE',
    },
    { type: 'CHECKED_IN', title: 'Check-in Realizado', state: 'COMPLETE' },
    { type: 'IN_PROGRESS', title: 'Serviço em Andamento', state: 'COMPLETE' },
    { type: 'CHECKED_OUT', title: 'Check-out Realizado', state: 'COMPLETE' },
    { type: 'PROOF_UPLOADED', title: 'Prova Enviada', state: 'COMPLETE' },
    { type: 'COMPLETED', title: 'Serviço Concluído', state: 'COMPLETE' },
    {
      type: 'PAYMENT_RELEASED',
      title: 'Pagamento Liberado',
      state: 'COMPLETE',
    },
  ];

  for (const event of timelineEvents) {
    await prisma.operationalTimelineEvent.create({
      data: {
        orderId: order.id,
        type: event.type,
        title: event.title,
        state: event.state,
        metadata: toJson({ seed: true, package: 'boraservico', phase: 'seed' }),
      },
    });
  }

  console.log('✅ TimelineEvents created');

  // ============================================
  // CRIAR REVIEWS
  // ============================================

  await prisma.review.create({
    data: {
      orderId: order.id,
      reviewerId: client.id,
      reviewedId: professional.id,
      rating: 5,
      comment: 'Excelente profissional! Trabalho impecável.',
    },
  });

  await prisma.reputationProfile.create({
    data: {
      userId: professional.id,
      averageRating: 5.0,
      totalReviews: 1,
      completedServices: 1,
      cancelledServices: 0,
      responseTimeScore: 100,
      reliabilityScore: 100,
      reputationScore: 100,
    },
  });

  console.log('✅ Reviews created');

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('📧 Test accounts:');
  console.log('   Admin: admin@boraservico.com / password');
  console.log('   Cliente: cliente.fernandes@boraservico.com / password');
  console.log('   Profissional: maria.profissional@boraservico.com / password');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
