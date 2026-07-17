import { prisma } from '@udt/db';
import { redis, keys } from '../config/redis';
import { emitToAll } from '../ws';

/**
 * Phase 1 — Révèle les coordonnées de départ et d'arrivée.
 * Les données sont déjà en base ; on émet juste un événement WebSocket
 * pour que les clients rechargent les informations de l'édition.
 */
export async function processPhaseDepart(editionId: string): Promise<void> {
  emitToAll(editionId, 'checkpoint:revealed', {
    editionId,
    phase: 'depart',
    timestamp: new Date().toISOString(),
  });
  console.log(`[Devoilement] ${editionId}: phase départ/arrivée`);
}

/**
 * Phase 2 — Révèle les checkpoints (sans leurs points).
 */
export async function processPhaseCheckpoints(editionId: string): Promise<void> {
  emitToAll(editionId, 'checkpoint:revealed', {
    editionId,
    phase: 'checkpoints',
    timestamp: new Date().toISOString(),
  });
  console.log(`[Devoilement] ${editionId}: phase checkpoints`);
}

/**
 * Phase 3 — Révèle les points de chaque checkpoint.
 */
export async function processPhasePoints(editionId: string): Promise<void> {
  emitToAll(editionId, 'checkpoint:revealed', {
    editionId,
    phase: 'points',
    timestamp: new Date().toISOString(),
  });
  console.log(`[Devoilement] ${editionId}: phase points`);
}

/**
 * Passe les équipes CONFIRMEE → EN_COURSE au début de la course.
 * Enregistre aussi l'heure de départ sur chaque équipe.
 */
export async function startConfirmedTeams(editionId: string): Promise<void> {
  const now = new Date();
  const { count } = await prisma.equipe.updateMany({
    where: { edition_id: editionId, statut: 'CONFIRMEE' },
    data: { statut: 'EN_COURSE', heure_depart: now },
  });
  if (count > 0) {
    console.log(`[Course] ${editionId}: ${count} équipe(s) passée(s) EN_COURSE`);
  }
}

/**
 * Active le gel du classement pour une édition.
 * Après activation, emitToEdition ne diffusera plus les mises à jour
 * aux sockets de type "participant".
 */
export async function activateGel(editionId: string): Promise<void> {
  // TTL 4h — bien au-delà de la fin de course
  await redis.set(keys.gelActive(editionId), '1', { EX: 4 * 3600 });
  console.log(`[Gel] ${editionId}: classement gelé`);
}
