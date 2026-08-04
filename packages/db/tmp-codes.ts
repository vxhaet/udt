import { prisma } from '@udt/db';
async function main() {
  const ed = await prisma.edition.findUnique({ where: { slug: 'udt-2026' }, select: { id: true } });
  if (ed === null) { console.log('introuvable'); return; }
  const eq = await prisma.equipe.findMany({
    where: { edition_id: ed.id, statut: 'EN_COURSE' },
    select: { nom: true, code_acces: true },
    orderBy: { created_at: 'asc' },
  });
  for (const e of eq) console.log(e.nom + ' -> ' + e.code_acces);
}
main().catch(e => console.error('ERREUR:', e)).finally(() => process.exit(0));
