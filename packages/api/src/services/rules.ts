import { prisma } from '@udt/db';
import { redis, keys } from '../config/redis';
import { emitToAll } from '../ws';

/**
 * Évalue toutes les RegleCheckpoint associées à un checkpoint venant d'être validé.
 * Gère aussi le flag disparait_apres_passage.
 */
export async function evaluateRules(
  checkpointId: string,
  equipeId: string,
  editionId: string,
): Promise<void> {
  const [checkpoint, regles, config] = await Promise.all([
    prisma.checkpoint.findUnique({ where: { id: checkpointId } }),
    prisma.regleCheckpoint.findMany({ where: { checkpoint_id: checkpointId } }),
    prisma.configEdition.findUnique({ where: { edition_id: editionId } }),
  ]);

  // ── Règles du checkpoint ────────────────────────────────────────────────────

  for (const regle of regles) {
    switch (regle.type_regle) {
      // Le prochain checkpoint de l'équipe doit obligatoirement être checkpoint_cible_id
      case 'IMPOSE_SUIVANT': {
        if (!config?.checkpoint_suivant_impose_actif && config !== null) break;
        if (regle.checkpoint_cible_id) {
          await redis.set(
            keys.equipeRequiredNext(equipeId),
            regle.checkpoint_cible_id,
            { EX: 86_400 }, // TTL 24h
          );
        }
        break;
      }

      // Valider ce checkpoint bloque checkpoint_cible_id pour cette équipe
      case 'EXCLUSIF_AVEC': {
        if (regle.checkpoint_cible_id) {
          await redis.sAdd(keys.equipeBlockedCheckpoints(equipeId), regle.checkpoint_cible_id);
        }
        break;
      }

      // Bonus de points si ce checkpoint est validé à l'ordre exact spécifié
      case 'BONUS_SI_ORDRE': {
        const params = regle.parametres as { ordre?: number; bonus?: number };
        if (typeof params.ordre === 'number' && typeof params.bonus === 'number') {
          const nbValidations = await prisma.validation.count({
            where: { equipe_id: equipeId, statut: 'APPROUVE' },
          });
          // nbValidations inclut déjà la validation qu'on vient d'approuver
          if (nbValidations === params.ordre) {
            await prisma.validation.updateMany({
              where: { equipe_id: equipeId, checkpoint_id: checkpointId, statut: 'APPROUVE' },
              data: { points_accordes: { increment: params.bonus } },
            });
          }
        }
        break;
      }
    }
  }

  // ── disparait_apres_passage ─────────────────────────────────────────────────
  // Dès qu'une équipe valide ce checkpoint, il disparaît pour toutes les autres
  const disparitionActif = !config || config.checkpoints_disparaissent_actif;

  if (checkpoint?.disparait_apres_passage && disparitionActif) {
    await prisma.checkpoint.update({
      where: { id: checkpointId },
      data: { actif: false },
    });

    // Garder la trace en Redis pour les accès rapides
    await redis.sAdd(keys.editionTakenCheckpoints(editionId), checkpointId);

    // Notifier tous les clients que ce checkpoint est maintenant pris
    emitToAll(editionId, 'checkpoint:taken', { checkpointId, takenByEquipeId: equipeId });
  }
}
