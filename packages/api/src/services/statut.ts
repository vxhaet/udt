import { prisma } from '@udt/db';

type EditionStatut = 'INSCRIPTION' | 'EN_COURS' | 'TERMINE';

export function computeStatut(dateCourse: Date, dureeMinutes: number): EditionStatut {
  const now = new Date();
  const fin = new Date(dateCourse.getTime() + dureeMinutes * 60_000);
  if (now < dateCourse) return 'INSCRIPTION';
  if (now >= fin) return 'TERMINE';
  return 'EN_COURS';
}

export async function syncEditionStatut(
  editionId: string,
  dateCourse: Date,
  dureeMinutes: number,
): Promise<EditionStatut> {
  const edition = await prisma.edition.findUnique({ where: { id: editionId }, select: { statut: true } });
  const newStatut = computeStatut(dateCourse, dureeMinutes);

  // Ne rien faire si le statut n'a pas changé
  if (edition?.statut === newStatut) return newStatut;

  await prisma.edition.update({
    where: { id: editionId },
    data: { statut: newStatut },
  });

  if (newStatut === 'EN_COURS') {
    await prisma.equipe.updateMany({
      where: { edition_id: editionId, statut: { in: ['CONFIRMEE', 'ARRIVEE'] } },
      data: { statut: 'EN_COURSE', heure_depart: dateCourse, heure_arrivee: null },
    });
  } else if (newStatut === 'TERMINE') {
    const fin = new Date(dateCourse.getTime() + dureeMinutes * 60_000);
    await prisma.equipe.updateMany({
      where: { edition_id: editionId, statut: 'EN_COURSE' },
      data: { statut: 'ARRIVEE', heure_arrivee: fin },
    });
  } else {
    await prisma.equipe.updateMany({
      where: { edition_id: editionId, statut: { in: ['EN_COURSE', 'ARRIVEE'] } },
      data: { statut: 'CONFIRMEE', heure_depart: null, heure_arrivee: null },
    });
  }

  console.log(`[Statut] ${editionId}: ${edition?.statut} → ${newStatut}`);
  return newStatut;
}
