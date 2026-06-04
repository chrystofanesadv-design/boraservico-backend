import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function upsertUser(email: string, name: string, role: any) {
  const password = await bcrypt.hash('12345678', 10);

  await prisma.user.upsert({
    where: { email },
    update: { password, name, role },
    create: { email, password, name, role },
  });

  console.log(`OK: ${email}`);
}

async function main() {
  await upsertUser('fernandescliente@gmail.com', 'Cliente Teste', 'CLIENT');
  await upsertUser('fernandesprofissional@gmail.com', 'Profissional Teste', 'PROFESSIONAL');
  await upsertUser('fernandesadmin@gmail.com', 'Admin Teste', 'ADMIN');
}

main()
  .finally(async () => prisma.$disconnect());