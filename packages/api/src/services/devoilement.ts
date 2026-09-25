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
 * Active le gel du classement pour un format specifique.
 * Prend un snapshot du classement des equipes de ce format.
 */
export async function activateGelFormat(formatId: string): Promise<void> {
  const format = await prisma.formatCourse.findUnique({ where: { id: formatId }, select: { id: true, edition_id: true, nom: true, gel_actif: true } });
  if (!format || format.gel_actif) return;

  const equipes = await prisma.equipe.findMany({
    where: {
      format_course_id: formatId,
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

  await prisma.formatCourse.update({
    where: { id: formatId },
    data: { gel_actif: true, classement_gele: snapshot as unknown as any },
  });

  // Also set edition-level gel + Redis if all formats are frozen
  const allFormats = await prisma.formatCourse.findMany({ where: { edition_id: format.edition_id }, select: { gel_actif: true } });
  const allFrozen = allFormats.every((f) => f.gel_actif);
  if (allFrozen) {
    await redis.set(keys.gelActive(format.edition_id), '1', { EX: 4 * 3600 });
    await prisma.edition.update({ where: { id: format.edition_id }, data: { gel_actif: true } });
  }

  console.log(`[Gel] format ${format.nom} (${formatId}): classement gele (${snapshot.length} equipes)`);
}

/**
 * Legacy: gel edition-level (for editions without formats)
 */
export async function activateGel(editionId: string): Promise<void> {
  await redis.set(keys.gelActive(editionId), '1', { EX: 4 * 3600 });

  const equipes = await prisma.equipe.findMany({
    where: { edition_id: editionId, statut: { notIn: ['INSCRITE', 'DISQUALIFIEE'] } },
    include: {
      _count: { select: { validations: { where: { statut: 'APPROUVE' } } } },
      format_course: { select: { id: true, nom: true, duree_minutes: true } },
      validations: { where: { statut: 'APPROUVE' }, orderBy: { validated_at: 'desc' }, take: 1, include: { checkpoint: { select: { nom: true } } } },
    },
    orderBy: [{ score_total: 'desc' }, { distance_vol_oiseau_km: 'desc' }, { heure_arrivee: 'asc' }],
  });

  const snapshot: ClassementEntry[] = equipes.map((equipe, idx) => ({
    rang: idx + 1, equipeId: equipe.id, nom: equipe.nom, scoreTotal: equipe.score_total,
    distanceVolOiseauKm: equipe.distance_vol_oiseau_km, nbCheckpoints: equipe._count.validations,
    heureArrivee: equipe.heure_arrivee?.toISOString() ?? null, statut: equipe.statut,
    format_course: equipe.format_course ?? null,
    dernier_checkpoint: equipe.validations[0] ? { nom: equipe.validations[0].checkpoint.nom, validated_at: equipe.validations[0].validated_at.toISOString() } : null,
  }));

  await prisma.edition.update({ where: { id: editionId }, data: { gel_actif: true, classement_gele: snapshot as unknown as any } });
  console.log(`[Gel] ${editionId}: classement gele (${snapshot.length} equipes)`);
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
