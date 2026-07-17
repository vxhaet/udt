import cron from 'node-cron';
import { prisma } from '@udt/db';
import {
  processPhaseDepart,
  processPhaseCheckpoints,
  processPhasePoints,
  startConfirmedTeams,
  activateGel,
} from '../services/devoilement';

// Ensemble des phases déjà traitées (clé = `${editionId}:${phase}`)
// Résistant aux redémarrages car on vérifie aussi les timestamps en base
const processed = new Set<string>();

/**
 * Démarre le job cron qui s'exécute chaque minute pour vérifier
 * si une phase de dévoilement ou le gel doit être activé.
 */
export function startDevoilementJobs(): void {
  cron.schedule('* * * * *', async () => {
    try {
      await checkDevoilements();
    } catch (err) {
      console.error('[Jobs] Devoilement cron error:', err);
    }
  });

  console.log('[Jobs] Devoilement cron démarré (fréquence: 1 min)');
}

async function checkDevoilements(): Promise<void> {
  const now = new Date();

  const editions = await prisma.edition.findMany({
    where: { statut: { in: ['INSCRIPTION', 'EN_COURS'] } },
    select: {
      id: true,
      date_course: true,
      devoilement_depart: true,
      devoilement_checkpoints: true,
      devoilement_points: true,
      gel_classement: true,
    },
  });

  for (const edition of editions) {
    const { id, date_course, devoilement_depart, devoilement_checkpoints, devoilement_points, gel_classement } = edition;

    if (!processed.has(`${id}:course`) && now >= date_course) {
      processed.add(`${id}:course`);
      await startConfirmedTeams(id);
    }

    if (!processed.has(`${id}:depart`) && now >= devoilement_depart) {
      processed.add(`${id}:depart`);
      await processPhaseDepart(id);
    }

    if (!processed.has(`${id}:checkpoints`) && now >= devoilement_checkpoints) {
      processed.add(`${id}:checkpoints`);
      await processPhaseCheckpoints(id);
    }

    if (!processed.has(`${id}:points`) && now >= devoilement_points) {
      processed.add(`${id}:points`);
      await processPhasePoints(id);
    }

    if (!processed.has(`${id}:gel`) && now >= gel_classement) {
      processed.add(`${id}:gel`);
      await activateGel(id);
    }
  }
}
