import { prisma } from '@udt/db';

type EditionStatut = 'INSCRIPTION' | 'EN_COURS' | 'TERMINE';

/**
 * Compute edition status based on all formats.
 * - INSCRIPTION: before the earliest format start
 * - EN_COURS: at least one format is running
 * - TERMINE: all formats have ended
 */
export async function syncEditionStatut(
  editionId: string,
  fallbackDateCourse: Date,
  fallbackDureeMinutes: number,
): Promise<EditionStatut> {
  const now = new Date();

  const formats = await prisma.formatCourse.findMany({
    where: { edition_id: editionId },
    select: { id: true, date_depart: true, duree_minutes: true },
  });

  let earliestStart: Date;
  let latestEnd: Date;

  if (formats.length > 0) {
    const formatsWithDepart = formats.filter((f) => f.date_depart !== null);
    if (formatsWithDepart.length === 0) {
      // Aucun format n'a de date de depart configuree → pas encore pret
      const edition = await prisma.edition.findUnique({ where: { id: editionId }, select: { statut: true } });
      if (edition?.statut !== 'INSCRIPTION') {
        await prisma.edition.update({ where: { id: editionId }, data: { statut: 'INSCRIPTION' } });
      }
      return 'INSCRIPTION';
    }
    const starts = formatsWithDepart.map((f) => f.date_depart!);
    const ends = formatsWithDepart.map((f) => new Date(f.date_depart!.getTime() + f.duree_minutes * 60_000));
    earliestStart = new Date(Math.min(...starts.map((d) => d.getTime())));
    latestEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
  } else {
    earliestStart = fallbackDateCourse;
    latestEnd = new Date(fallbackDateCourse.getTime() + fallbackDureeMinutes * 60_000);
  }

  let newStatut: EditionStatut;
  if (now < earliestStart) newStatut = 'INSCRIPTION';
  else if (now >= latestEnd) newStatut = 'TERMINE';
  else newStatut = 'EN_COURS';

  const edition = await prisma.edition.findUnique({ where: { id: editionId }, select: { statut: true } });

  if (edition?.statut !== newStatut) {
    await prisma.edition.update({ where: { id: editionId }, data: { statut: newStatut } });
    console.log(`[Statut] ${editionId}: ${edition?.statut} → ${newStatut}`);
  }

  // Sync team statuses per format
  if (formats.length > 0) {
    for (const fmt of formats) {
      if (!fmt.date_depart) {
        // Pas de date de depart → equipes restent CONFIRMEE
        await prisma.equipe.updateMany({
          where: { edition_id: editionId, format_course_id: fmt.id, statut: { in: ['EN_COURSE', 'ARRIVEE'] } },
          data: { statut: 'CONFIRMEE', heure_depart: null, heure_arrivee: null },
        });
        continue;
      }
      const fmtStart = fmt.date_depart;
      const fmtEnd = new Date(fmtStart.getTime() + fmt.duree_minutes * 60_000);

      if (now >= fmtStart && now < fmtEnd) {
        // Format en cours → equipes CONFIRMEE/ARRIVEE → EN_COURSE
        await prisma.equipe.updateMany({
          where: { edition_id: editionId, format_course_id: fmt.id, statut: { in: ['CONFIRMEE', 'ARRIVEE'] } },
          data: { statut: 'EN_COURSE', heure_depart: fmtStart, heure_arrivee: null },
        });
      } else if (now >= fmtEnd) {
        // Format termine → equipes EN_COURSE → ARRIVEE
        await prisma.equipe.updateMany({
          where: { edition_id: editionId, format_course_id: fmt.id, statut: 'EN_COURSE' },
          data: { statut: 'ARRIVEE', heure_arrivee: fmtEnd },
        });
      } else {
        // Format pas encore commence → equipes → CONFIRMEE
        await prisma.equipe.updateMany({
          where: { edition_id: editionId, format_course_id: fmt.id, statut: { in: ['EN_COURSE', 'ARRIVEE'] } },
          data: { statut: 'CONFIRMEE', heure_depart: null, heure_arrivee: null },
        });
      }
    }

    // Equipes sans format
    if (now >= earliestStart && now < latestEnd) {
      await prisma.equipe.updateMany({
        where: { edition_id: editionId, format_course_id: null, statut: { in: ['CONFIRMEE', 'ARRIVEE'] } },
        data: { statut: 'EN_COURSE', heure_depart: earliestStart, heure_arrivee: null },
      });
    } else if (now >= latestEnd) {
      await prisma.equipe.updateMany({
        where: { edition_id: editionId, format_course_id: null, statut: 'EN_COURSE' },
        data: { statut: 'ARRIVEE', heure_arrivee: latestEnd },
      });
    }
  } else {
    // Pas de formats — logique simple
    if (newStatut === 'EN_COURS') {
      await prisma.equipe.updateMany({
        where: { edition_id: editionId, statut: { in: ['CONFIRMEE', 'ARRIVEE'] } },
        data: { statut: 'EN_COURSE', heure_depart: fallbackDateCourse, heure_arrivee: null },
      });
    } else if (newStatut === 'TERMINE') {
      await prisma.equipe.updateMany({
        where: { edition_id: editionId, statut: 'EN_COURSE' },
        data: { statut: 'ARRIVEE', heure_arrivee: latestEnd },
      });
    } else {
      await prisma.equipe.updateMany({
        where: { edition_id: editionId, statut: { in: ['EN_COURSE', 'ARRIVEE'] } },
        data: { statut: 'CONFIRMEE', heure_depart: null, heure_arrivee: null },
      });
    }
  }

  return newStatut;
}
