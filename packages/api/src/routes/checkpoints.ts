import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateCheckpointSchema, CreateRegleSchema } from '@udt/shared';
import { requireUser, optionalAuth } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { emitToAll } from '../ws';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

const FORMAT_INCLUDE = { formats: { select: { id: true, nom: true, duree_minutes: true } } };

export const checkpointsRouter: Router = Router();

// GET /editions/:id/checkpoints
checkpointsRouter.get('/:id/checkpoints', optionalAuth(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const now = new Date();
    const isAdmin = !!req.user;

    if (!isAdmin && now < edition.devoilement_checkpoints) {
      return res.json([]);
    }

    const showPoints = isAdmin || now >= edition.devoilement_points;

    const checkpoints = await prisma.checkpoint.findMany({
      where: { edition_id: req.params.id },
      select: {
        id: true,
        nom: true,
        description: true,
        latitude: true,
        longitude: true,
        points: showPoints,
        rayon_validation_metres: true,
        type_validation: true,
        disparait_apres_passage: true,
        actif: true,
        ordre_affichage: true,
        type: true,
        tous_formats: true,
        formats: { select: { id: true, nom: true, duree_minutes: true } },
        regles: isAdmin,
      },
      orderBy: { ordre_affichage: 'asc' },
    });

    res.json(checkpoints);
  } catch (err) {
    next(err);
  }
});

// POST /editions/:id/checkpoints
checkpointsRouter.post(
  '/:id/checkpoints',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
      if (!edition) throw new AppError(404, 'Édition introuvable');

      const body = CreateCheckpointSchema.parse(req.body);
      const { format_course_ids, ...rest } = body;
      const checkpoint = await prisma.checkpoint.create({
        data: {
          ...rest,
          edition_id: req.params.id,
          formats: !rest.tous_formats && format_course_ids.length
            ? { connect: format_course_ids.map((id) => ({ id })) }
            : undefined,
        },
        include: FORMAT_INCLUDE,
      });

      res.status(201).json(checkpoint);
    } catch (err) {
      next(err);
    }
  },
);

// GET /editions/:id/checkpoints/:cpId
checkpointsRouter.get('/:id/checkpoints/:cpId', requireUser(), async (req, res, next) => {
  try {
    const checkpoint = await prisma.checkpoint.findUnique({
      where: { id: req.params.cpId },
      include: { regles: true },
    });
    if (!checkpoint || checkpoint.edition_id !== req.params.id) {
      throw new AppError(404, 'Checkpoint introuvable');
    }
    res.json(checkpoint);
  } catch (err) {
    next(err);
  }
});

// PATCH /editions/:id/checkpoints/:cpId
checkpointsRouter.patch(
  '/:id/checkpoints/:cpId',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const existing = await prisma.checkpoint.findUnique({ where: { id: req.params.cpId } });
      if (!existing || existing.edition_id !== req.params.id) {
        throw new AppError(404, 'Checkpoint introuvable');
      }

      const body = CreateCheckpointSchema.partial().parse(req.body);
      const { format_course_ids, ...rest } = body;
      const updated = await prisma.checkpoint.update({
        where: { id: req.params.cpId },
        data: {
          ...rest,
          ...(format_course_ids !== undefined || rest.tous_formats !== undefined
            ? {
                formats: {
                  set: !rest.tous_formats && format_course_ids?.length
                    ? format_course_ids.map((id) => ({ id }))
                    : [],
                },
              }
            : {}),
        },
        include: FORMAT_INCLUDE,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /editions/:id/checkpoints/:cpId
checkpointsRouter.delete(
  '/:id/checkpoints/:cpId',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const existing = await prisma.checkpoint.findUnique({ where: { id: req.params.cpId } });
      if (!existing || existing.edition_id !== req.params.id) {
        throw new AppError(404, 'Checkpoint introuvable');
      }

      await prisma.checkpoint.delete({ where: { id: req.params.cpId } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// POST /editions/:id/checkpoints/ephemere
checkpointsRouter.post(
  '/:id/checkpoints/ephemere',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'),
  async (req, res, next) => {
    try {
      const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
      if (!edition) throw new AppError(404, 'Édition introuvable');

      const { latitude, longitude, nom, points } = req.body as {
        latitude: number;
        longitude: number;
        nom?: string;
        points?: number;
      };

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        throw new AppError(400, 'latitude et longitude requis');
      }

      // Lire la config pour la durée et les points par défaut
      const config = await prisma.configEdition.findUnique({
        where: { edition_id: req.params.id },
      });
      const dureeMins = config?.ephemere_qg_duree_minutes ?? 30;
      const pointsDefaut = config?.ephemere_qg_points_defaut ?? 10;
      const cpPoints = points ?? pointsDefaut;
      const expiresAt = new Date(Date.now() + dureeMins * 60 * 1000);

      const checkpoint = await prisma.checkpoint.create({
        data: {
          edition_id: req.params.id,
          nom: nom ?? `QG Éphémère ${new Date().toLocaleTimeString('fr-FR')}`,
          latitude,
          longitude,
          points: cpPoints,
          rayon_validation_metres: 50,
          type_validation: 'AUTO',
          disparait_apres_passage: true,
          type: 'EPHEMERE_QG',
          expires_at: expiresAt,
        },
      });

      // Broadcast checkpoint révélé
      emitToAll(req.params.id, 'checkpoint:revealed', { checkpoint });

      // Message d'alerte broadcast (WS + push)
      const alertContenu =
        `🚨 Checkpoint QG éphémère apparu ! Soyez les premiers à le valider pour remporter ${cpPoints} points. Il expire dans ${dureeMins} minutes.`;

      emitToAll(req.params.id, 'message:qg', {
        id: crypto.randomUUID(),
        editionId: req.params.id,
        contenu: alertContenu,
        type: 'ALERTE',
        timestamp: new Date().toISOString(),
      });

      // Push Expo
      const participants = await prisma.participant.findMany({
        where: {
          equipe: { edition_id: req.params.id },
          expo_push_token: { not: null },
        },
        select: { expo_push_token: true },
      });
      const pushMessages: ExpoPushMessage[] = participants
        .filter((p) => p.expo_push_token && Expo.isExpoPushToken(p.expo_push_token))
        .map((p) => ({
          to: p.expo_push_token!,
          sound: 'default' as const,
          title: 'UDT — ALERTE',
          body: alertContenu,
          data: { type: 'ALERTE', editionId: req.params.id },
        }));
      if (pushMessages.length > 0) {
        const chunks = expo.chunkPushNotifications(pushMessages);
        for (const chunk of chunks) {
          expo.sendPushNotificationsAsync(chunk).catch((err) =>
            console.error('[Push] Ephemere alert error:', err),
          );
        }
      }

      // Expiration automatique
      setTimeout(async () => {
        try {
          const existing = await prisma.checkpoint.findUnique({ where: { id: checkpoint.id } });
          if (!existing || !existing.actif) return; // déjà désactivé
          await prisma.checkpoint.update({ where: { id: checkpoint.id }, data: { actif: false } });
          emitToAll(req.params.id, 'checkpoint:expired', { checkpointId: checkpoint.id });
        } catch { /* ignore */ }
      }, dureeMins * 60 * 1000);

      res.status(201).json(checkpoint);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /editions/:id/checkpoints/ephemere/:cpId/deactivate
checkpointsRouter.patch(
  '/:id/checkpoints/ephemere/:cpId/deactivate',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'),
  async (req, res, next) => {
    try {
      const existing = await prisma.checkpoint.findUnique({ where: { id: req.params.cpId } });
      if (!existing || existing.edition_id !== req.params.id || existing.type !== 'EPHEMERE_QG') {
        throw new AppError(404, 'Checkpoint éphémère introuvable');
      }
      await prisma.checkpoint.update({ where: { id: req.params.cpId }, data: { actif: false } });
      emitToAll(req.params.id, 'checkpoint:expired', { checkpointId: req.params.cpId });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// POST /editions/:id/checkpoints/:cpId/regles
checkpointsRouter.post(
  '/:id/checkpoints/:cpId/regles',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const existing = await prisma.checkpoint.findUnique({ where: { id: req.params.cpId } });
      if (!existing || existing.edition_id !== req.params.id) {
        throw new AppError(404, 'Checkpoint introuvable');
      }

      const body = CreateRegleSchema.parse(req.body);
      const regle = await prisma.regleCheckpoint.create({
        data: {
          checkpoint_id: req.params.cpId,
          type_regle: body.type_regle,
          checkpoint_cible_id: body.checkpoint_cible_id,
          parametres: body.parametres,
        },
      });
      res.status(201).json(regle);
    } catch (err) {
      next(err);
    }
  },
);
