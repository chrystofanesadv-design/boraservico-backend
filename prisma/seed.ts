import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Criando dados iniciais...');

  // evitar duplicar usuário se rodar 2x
  const existing = await prisma.user.findUnique({
    where: { email: 'client@test.com' },
  });

  const client =
    existing ??
    (await prisma.user.create({
      data: {
        email: 'client@test.com',
        password: '123456',
        name: 'Cliente Teste',
        role: UserRole.CLIENT,
      },
    }));

  // limpar dados antigos (evita duplicação)
  await prisma.serviceOrder.deleteMany();

  // criar ordens reais
  await prisma.serviceOrder.createMany({
    data: [
      {
        clientId: client.id,
        title: 'Serviço Pintura Residencial',
        description: 'Pintura completa de casa',
        price: 100,
      },
      {
        clientId: client.id,
        title: 'Serviço Encanador',
        description: 'Reparo hidráulico básico',
        price: 150,
      },
      {
        clientId: client.id,
        title: 'Serviço Eletricista',
        description: 'Instalação elétrica simples',
        price: 120,
      },
    ],
  });

  console.log('✅ Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });