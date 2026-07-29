import { prisma } from '@udt/db';

async function main() {
  const ed = await prisma.edition.findUnique({
    where: { slug: 'udt-demo' },
    select: { id: true },
  });
  if (ed === null) { console.log('introuvable'); return; }

  const pending = await prisma.validation.findMany({
    where: { equipe: { edition_id: ed.id }, statut: 'EN_ATTENTE' },
    select: {
      id: true,
      equipe: { select: { id: true, nom: true, score_total: true } },
      checkpoint: { select: { nom: true, points: true } },
    },
  });

  console.log('Validations en attente: ' + pending.length);

  for (const v of pending) {
    await prisma.$transaction([
      prisma.validation.update({
        where: { id: v.id },
        data: { statut: 'APPROUVE' },
      }),
      prisma.equipe.update({
        where: { id: v.equipe.id },
        data: { score_total: { increment: v.checkpoint.points } },
      }),
    ]);
    console.log('APPROUVE: ' + v.equipe.nom + ' -> ' + v.checkpoint.nom + ' (+' + v.checkpoint.points + ' pts)');
  }

  const eq = await prisma.equipe.findMany({
    where: { edition_id: ed.id },
    select: { nom: true, score_total: true },
    orderBy: { score_total: 'desc' },
  });
  console.log('--- SCORES ---');
  for (const e of eq) console.log(e.nom + ' : ' + e.score_total);
}

main().then(() => process.exit(0));