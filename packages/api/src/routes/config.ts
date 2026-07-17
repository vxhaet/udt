import { Router } from 'express';
import { prisma } from '@udt/db';
import { UpdateConfigEditionSchema } from '@udt/shared';
import { requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';

export const configRouter = Router();

// GET /editions/:id/config
configRouter.get('/:id/config', requireUser(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const config = await prisma.configEdition.findUnique({
      where: { edition_id: req.params.id },
    });

    // Retourner les valeurs par défaut si pas encore de config
    res.json(
      config ?? {
        edition_id: req.params.id,
        checkpoints_disparaissent_actif: true,
        checkpoint_suivant_impose_actif: true,
        itineraires_thematiques_actif: true,
        checkpoint_ephemere_qg_actif: true,
        segments_strava_actif: true,
        gel_classement_actif: true,
        devoilement_progressif_actif: true,
        ephemere_qg_duree_minutes: 1,
        ephemere_qg_points_defaut: 10,
      },
    );
  } catch (err) {
    next(err);
  }
});

// PUT /editions/:id/config
configRouter.put(
  '/:id/config',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
      if (!edition) throw new AppError(404, 'Édition introuvable');

      const body = UpdateConfigEditionSchema.parse(req.body);

      const config = await prisma.configEdition.upsert({
        where: { edition_id: req.params.id },
        create: { edition_id: req.params.id, ...body },
        update: body,
      });

      res.json(config);
    } catch (err) {
      next(err);
    }
  },
);
