import { prisma } from '@udt/db';

/**
 * Vérifie si l'équipe vient de compléter un itinéraire thématique.
 * Si oui, attribue les points bonus (une seule fois par itinéraire).
 */
export async function checkItineraireCompletion(
  equipeId: string,
  editionId: string,
): Promise<number> {
  const config = await prisma.configEdition.findUnique({ where: { edition_id: editionId } });
  if (config && !config.itineraires_thematiques_actif) return 0;

  // Récupérer les itinéraires actifs de l'édition
  const itineraires = await prisma.itineraireThematique.findMany({
    where: { edition_id: editionId, actif: true },
    include: { checkpoints: { select: { id: true } } },
  });

  if (itineraires.length === 0) return 0;

  // Checkpoints approuvés par cette équipe
  const validatedCpIds = new Set(
    (
      await prisma.validation.findMany({
        where: { equipe_id: equipeId, statut: 'APPROUVE' },
        select: { checkpoint_id: true },
      })
    ).map((v) => v.checkpoint_id),
  );

  // Itinéraires déjà complétés par cette équipe
  const existingCompletes = new Set(
    (
      await prisma.itineraireComplete.findMany({
        where: { equipe_id: equipeId },
        select: { itineraire_id: true },
      })
    ).map((c) => c.itineraire_id),
  );

  let bonusTotal = 0;

  for (const itin of itineraires) {
    if (existingCompletes.has(itin.id)) continue;
    if (itin.checkpoints.length === 0) continue;

    const allDone = itin.checkpoints.every((cp) => validatedCpIds.has(cp.id));
    if (!allDone) continue;

    // Enregistrer la complétion
    await prisma.itineraireComplete.create({
      data: {
        equipe_id: equipeId,
        itineraire_id: itin.id,
        points_accordes: itin.points_bonus,
      },
    });

    bonusTotal += itin.points_bonus;
  }

  return bonusTotal;
}

// Formule de Haversine — distance en km entre deux points GPS
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Recalcule le score total et la distance à vol d'oiseau d'une équipe,
 * met à jour la base de données, et retourne les nouvelles valeurs.
 */
export async function updateTeamScore(
  equipeId: string,
): Promise<{ scoreTotal: number; distance: number }> {
  // Points des checkpoints approuvés
  const validations = await prisma.validation.findMany({
    where: { equipe_id: equipeId, statut: 'APPROUVE' },
    include: {
      checkpoint: { select: { latitude: true, longitude: true } },
    },
    orderBy: { validated_at: 'asc' },
  });

  const checkpointScore = validations.reduce((sum, v) => sum + v.points_accordes, 0);

  // Points Strava des participants de l'équipe
  const stravaAgg = await prisma.performanceStrava.aggregate({
    where: { participant: { equipe_id: equipeId } },
    _sum: { points_gagnes: true },
  });

  // Points des itinéraires thématiques complétés
  const itineraireAgg = await prisma.itineraireComplete.aggregate({
    where: { equipe_id: equipeId },
    _sum: { points_accordes: true },
  });

  const scoreTotal =
    checkpointScore +
    (stravaAgg._sum.points_gagnes ?? 0) +
    (itineraireAgg._sum.points_accordes ?? 0);

  // Distance à vol d'oiseau = somme des distances entre checkpoints successifs
  let distance = 0;
  for (let i = 1; i < validations.length; i++) {
    distance += haversineKm(
      validations[i - 1].checkpoint.latitude,
      validations[i - 1].checkpoint.longitude,
      validations[i].checkpoint.latitude,
      validations[i].checkpoint.longitude,
    );
  }
  const distanceRounded = Math.round(distance * 100) / 100;

  await prisma.equipe.update({
    where: { id: equipeId },
    data: { score_total: scoreTotal, distance_vol_oiseau_km: distanceRounded },
  });

  return { scoreTotal, distance: distanceRounded };
}
