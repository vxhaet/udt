import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateValidationSchema, PatchValidationSchema } from '@udt/shared';
import { requireParticipant, requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { validateCheckpointPosition } from '../services/validation';
import { updateTeamScore, checkItineraireCompletion } from '../services/scoring';
import { evaluateRules } from '../services/rules';
import { emitToEdition, emitToEquipe, emitToAdmins } from '../ws';
import { redis, keys } from '../config/redis';

export const validationsRouter: Router = Router();

// POST /validations — Soumettre une validation depuis l'app mobile
validationsRouter.post('/', requireParticipant(), async (req, res, next) => {
  try {
    const body = CreateValidationSchema.parse(req.body);
    const { participantId, equipeId, editionId } = req.participant!;

    // Vérifier que l'équipe est en course
    const equipe = await prisma.equipe.findUnique({ where: { id: equipeId } });
    if (!equipe || equipe.statut !== 'EN_COURSE') {
      throw new AppError(400, 'Votre équipe n\'est pas en course');
    }

    // Vérifier le checkpoint
    const checkpoint = await prisma.checkpoint.findUnique({
      where: { id: body.checkpointId },
    });
    if (!checkpoint) throw new AppError(404, 'Checkpoint introuvable');
    if (checkpoint.edition_id !== editionId) throw new AppError(400, 'Checkpoint hors de l\'édition');
    if (!checkpoint.actif) throw new AppError(400, 'Ce checkpoint n\'est plus disponible');

    // Vérifier les checkpoints bloqués (règle EXCLUSIF_AVEC)
    const isBlocked = await redis.sIsMember(
      keys.equipeBlockedCheckpoints(equipeId),
      body.checkpointId,
    );
    if (isBlocked) throw new AppError(400, 'Ce checkpoint est bloqué pour votre équipe');

    // Vérifier le checkpoint obligatoire suivant (règle IMPOSE_SUIVANT)
    const requiredNext = await redis.get(keys.equipeRequiredNext(equipeId));
    if (requiredNext && requiredNext !== body.checkpointId) {
      throw new AppError(
        400,
        `Votre équipe doit valider le checkpoint imposé avant de continuer`,
      );
    }

    // Vérifier doublon (déjà approuvé)
    const alreadyValidated = await prisma.validation.findFirst({
      where: { equipe_id: equipeId, checkpoint_id: body.checkpointId, statut: 'APPROUVE' },
    });
    if (alreadyValidated) throw new AppError(409, 'Ce checkpoint a déjà été validé');

    // Vérifier le rayon GPS
    const inRadius = validateCheckpointPosition(
      body.latitude,
      body.longitude,
      checkpoint.latitude,
      checkpoint.longitude,
      checkpoint.rayon_validation_metres,
    );
    if (!inRadius) {
      throw new AppError(400, 'Vous n\'êtes pas dans le rayon de validation du checkpoint');
    }

    const isAuto = checkpoint.type_validation === 'AUTO';
    const statut = isAuto ? 'APPROUVE' : 'EN_ATTENTE';
    const points_accordes = isAuto ? checkpoint.points : 0;

    const validation = await prisma.validation.create({
      data: {
        equipe_id: equipeId,
        checkpoint_id: body.checkpointId,
        latitude: body.latitude,
        longitude: body.longitude,
        photo_url: body.photo_url,
        statut,
        points_accordes,
      },
    });

    if (isAuto) {
      // Effacer le checkpoint obligatoire si c'était celui-ci
      if (requiredNext === body.checkpointId) {
        await redis.del(keys.equipeRequiredNext(equipeId));
      }

      // Évaluer les règles du checkpoint
      await evaluateRules(checkpoint.id, equipeId, editionId);

      // Vérifier les itinéraires thématiques complétés
      await checkItineraireCompletion(equipeId, editionId);

      // Recalculer le score
      const { scoreTotal, distance } = await updateTeamScore(equipeId);

      // Diffuser la mise à jour (respecte le gel)
      await emitToEdition(editionId, 'validation:approved', {
        validation,
        equipeId,
        scoreTotal,
        distanceVolOiseauKm: distance,
      });
    } else {
      // Notifier les admins QG d'une validation en attente
      emitToAdmins(editionId, 'validation:pending', {
        validation,
        equipeId,
        checkpointNom: checkpoint.nom,
      });
    }

    res.status(201).json(validation);
  } catch (err) {
    next(err);
  }
});

// PATCH /validations/:id — Admin approuve ou rejette une validation manuelle
validationsRouter.patch('/:id', requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'), async (req, res, next) => {
  try {
    const body = PatchValidationSchema.parse(req.body);

    const existing = await prisma.validation.findUnique({
      where: { id: req.params.id },
      include: { checkpoint: true },
    });
    if (!existing) throw new AppError(404, 'Validation introuvable');
    if (existing.statut !== 'EN_ATTENTE') throw new AppError(400, 'Cette validation a déjà été traitée');

    const points_accordes =
      body.statut === 'APPROUVE'
        ? (body.points_accordes ?? existing.checkpoint.points)
        : 0;

    const updated = await prisma.validation.update({
      where: { id: req.params.id },
      data: {
        statut: body.statut,
        commentaire_admin: body.commentaire_admin,
        points_accordes,
        validateur_id: req.user!.userId,
      },
    });

    const editionId = existing.checkpoint.edition_id;

    if (body.statut === 'APPROUVE') {
      await evaluateRules(existing.checkpoint_id, existing.equipe_id, editionId);
      await checkItineraireCompletion(existing.equipe_id, editionId);
      const { scoreTotal, distance } = await updateTeamScore(existing.equipe_id);

      await emitToEdition(editionId, 'validation:approved', {
        validation: updated,
        equipeId: existing.equipe_id,
        scoreTotal,
        distanceVolOiseauKm: distance,
      });
    } else {
      emitToEquipe(existing.equipe_id, 'validation:rejected', {
        validation: updated,
        commentaire: body.commentaire_admin,
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /validations/pending — Liste des validations en attente (QG)
validationsRouter.get('/pending', requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'), async (req, res, next) => {
  try {
    const { editionId } = req.query as { editionId?: string };

    const validations = await prisma.validation.findMany({
      where: {
        statut: 'EN_ATTENTE',
        ...(editionId ? { checkpoint: { edition_id: editionId } } : {}),
      },
      include: {
        equipe: { select: { id: true, nom: true } },
        checkpoint: { select: { id: true, nom: true, points: true, edition_id: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    res.json(validations);
  } catch (err) {
    next(err);
  }
});
