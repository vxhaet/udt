import { prisma } from '@udt/db';

async function main() {
  const ed = await prisma.edition.findUnique({
    where: { slug: 'udt-demo' },
    select: { id: true, statut: true },
  });
  if (ed === null) { console.log('introuvable'); return; }
  console.log('Edition statut:', ed.statut);

  const eq = await prisma.equipe.findMany({
    where: { edition_id: ed.id },
    select: { id: true, nom: true, statut: true, score_total: true },
  });
  console.log('\n--- EQUIPES ---');
  for (const e of eq) {
    console.log(e.nom + ' | statut=' + e.statut + ' | score=' + e.score_total);
  }

  const v = await prisma.validation.findMany({
    where: { equipe: { edition_id: ed.id } },
    select: {
      id: true, statut: true, created_at: true,
      equipe: { select: { nom: true } },
      checkpoint: { select: { nom: true, points: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 20,
  });
  console.log('\n--- VALIDATIONS (' + v.length + ') ---');
  for (const x of v) {
    console.log(x.equipe.nom + ' -> ' + x.checkpoint.nom + ' | ' + x.statut + ' | ' + x.checkpoint.points + ' pts');
  }
}

main().then(() => process.exit(0));