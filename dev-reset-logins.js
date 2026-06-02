const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const PASSWORD = '12345678';

const users = [
  {
    email: 'fernandescliente@gmail.com',
    name: 'Fernandes Cliente',
    role: 'CLIENT',
  },
  {
    email: 'fernandesprofissional@gmail.com',
    name: 'Fernandes Profissional',
    role: 'PROFESSIONAL',
  },
  {
    email: 'fernandesadmin@gmail.com',
    name: 'Fernandes Admin',
    role: 'ADMIN',
  },
];

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  for (const user of users) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        password: hash,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        password: hash,
      },
    });

    console.log(`OK: ${saved.email} | ${saved.role}`);
  }

  console.log('');
  console.log('Logins prontos.');
  console.log(`Senha: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });