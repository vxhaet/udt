import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '@udt/db';

async function main() {
  const email = 'admin@udt.fr';
  const password = 'password123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Utilisateur "${email}" déjà existant (id: ${existing.id})`);
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password_hash, role: 'SUPER_ADMIN' },
    select: { id: true, email: true, role: true },
  });

  console.log('Utilisateur créé :', user);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
