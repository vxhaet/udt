import { Prisma, prisma } from '@udt/db';
import type { ClassementEntry } from '@udt/shared';
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
 * Prend un snapshot du classement actuel (même structure que GET /classement)
 * et bloque les push WS aux participants.
 */
export async function activateGel(editionId: string): Promise<void> {
  // 1. Flag Redis — bloque emitToEdition pour les participants
  await redis.set(keys.gelActive(editionId), '1', { EX: 4 * 3600 });

  // 2. Snapshot du classement (même logique que GET /editions/:id/classement)
  const equipes = await prisma.equipe.findMany({
    where: {
      edition_id: editionId,
      statut: { notIn: ['INSCRITE', 'DISQUALIFIEE'] },
    },
    include: {
      _count: { select: { validations: { where: { statut: 'APPROUVE' } } } },
      format_course: { select: { id: true, nom: true, duree_minutes: true } },
      validations: {
        where: { statut: 'APPROUVE' },
        orderBy: { validated_at: 'desc' },
        take: 1,
        include: { checkpoint: { select: { nom: true } } },
      },
    },
    orderBy: [
      { score_total: 'desc' },
      { distance_vol_oiseau_km: 'desc' },
      { heure_arrivee: 'asc' },
    ],
  });

  const snapshot: ClassementEntry[] = equipes.map((equipe, idx) => ({
    rang: idx + 1,
    equipeId: equipe.id,
    nom: equipe.nom,
    scoreTotal: equipe.score_total,
    distanceVolOiseauKm: equipe.distance_vol_oiseau_km,
    nbCheckpoints: equipe._count.validations,
    heureArrivee: equipe.heure_arrivee?.toISOString() ?? null,
    statut: equipe.statut,
    format_course: equipe.format_course ?? null,
    dernier_checkpoint: equipe.validations[0]
      ? { nom: equipe.validations[0].checkpoint.nom, validated_at: equipe.validations[0].validated_at.toISOString() }
      : null,
  }));

  // 3. Persist snapshot + flag en DB
  await prisma.edition.update({
    where: { id: editionId },
    data: { gel_actif: true, classement_gele: snapshot as unknown as any },
  });

  console.log(`[Gel] ${editionId}: classement gelé (${snapshot.length} équipes snapshottées)`);
}

/**
 * Désactive le gel du classement — révèle les vrais scores.
 */
export async function deactivateGel(editionId: string): Promise<void> {
  await prisma.edition.update({
    where: { id: editionId },
    data: { gel_actif: false, classement_gele: Prisma.DbNull },
  });
  await redis.del(keys.gelActive(editionId));
  emitToAll(editionId, 'gel:deactivated', {});
  console.log(`[Gel] ${editionId}: classement dégelé`);
}
