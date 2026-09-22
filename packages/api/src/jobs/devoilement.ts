import cron from 'node-cron';
import { prisma } from '@udt/db';
import {
  processPhaseDepart,
  processPhaseCheckpoints,
  processPhasePoints,
  activateGel,
} from '../services/devoilement';
import { syncEditionStatut } from '../services/statut';

// Track WS notifications already sent (to avoid spamming clients every minute)
// This does NOT block logic — only prevents duplicate WS events
const notified = new Set<string>();

export function startDevoilementJobs(): void {
  cron.schedule('* * * * *', async () => {
    try {
      await checkDevoilements();
    } catch (err) {
      console.error('[Jobs] Devoilement cron error:', err);
    }
  });

  // Run immediately on startup
  checkDevoilements().catch(console.error);

  console.log('[Jobs] Devoilement cron démarré (fréquence: 1 min)');
}

export function resetNotified(editionId: string): void {
  for (const key of notified) {
    if (key.startsWith(`${editionId}:`)) notified.delete(key);
  }
}

async function checkDevoilements(): Promise<void> {
  const now = new Date();

  const editions = await prisma.edition.findMany({
    where: { statut: { notIn: ['ARCHIVE'] } },
    select: {
      id: true,
      statut: true,
      date_course: true,
      duree_minutes: true,
      devoilement_depart: true,
      devoilement_checkpoints: true,
      devoilement_points: true,
      gel_classement: true,
      gel_actif: true,
    },
  });

  for (const edition of editions) {
    const { id, date_course, devoilement_depart, devoilement_checkpoints, devoilement_points, gel_classement } = edition;

    // Synchroniser le statut (INSCRIPTION / EN_COURS / TERMINE) + equipes
    await syncEditionStatut(id, date_course, edition.duree_minutes);

    // Devoilement progressif — notify once
    if (!notified.has(`${id}:depart`) && now >= devoilement_depart) {
      notified.add(`${id}:depart`);
      await processPhaseDepart(id);
    }
    if (!notified.has(`${id}:checkpoints`) && now >= devoilement_checkpoints) {
      notified.add(`${id}:checkpoints`);
      await processPhaseCheckpoints(id);
    }
    if (!notified.has(`${id}:points`) && now >= devoilement_points) {
      notified.add(`${id}:points`);
      await processPhasePoints(id);
    }

    // Gel du classement — check DB state, not cache
    if (!edition.gel_actif && now >= gel_classement) {
      await activateGel(id);
    }
  }
}
