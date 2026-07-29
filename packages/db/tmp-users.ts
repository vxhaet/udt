import { prisma } from '@udt/db';
async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, created_at: true },
  });
  console.log(JSON.stringify(users, null, 2));
}
main().then(() => process.exit(0));