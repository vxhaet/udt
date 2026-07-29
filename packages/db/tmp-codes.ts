import { prisma } from '@udt/db';

async function main() {
  const ed = await prisma.edition.findUnique({
    where: { slug: 'udt-demo' },
    select: { id: true },
  });
  if (ed === null) { console.log('introuvable'); return; }

  const eq = await prisma.equipe.findMany({
    where: { edition_id: ed.id },
    select: {
      nom: true,
      code_acces: true,
      statut: true,
      email_capitaine: true,
      emails_membres: true,
      participants: { select: { prenom: true, nom: true, role: true } },
    },
    orderBy: { created_at: 'asc' },
  });

  for (const e of eq) {
    const c = e.participants.find((p) => p.role === 'CAPITAINE');
    console.log('=== ' + e.nom + ' (' + e.statut + ') ===');
    console.log('CODE: ' + e.code_acces);
    console.log('Capitaine: ' + (c ? c.prenom + ' ' + c.nom : '?') + ' - ' + e.email_capitaine);
    console.log('Membres: ' + JSON.stringify(e.emails_membres));
    console.log('');
  }
}

main().then(() => process.exit(0));