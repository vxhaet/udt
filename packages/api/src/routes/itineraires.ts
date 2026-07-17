import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateItineraireThematiqueSchema } from '@udt/shared';
import { requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';

export const itinerairesRouter = Router();

// GET /editions/:id/itineraires
itinerairesRouter.get('/:id/itineraires', requireUser(), async (req, res, next) => {
  try {
    const itineraires = await prisma.itineraireThematique.findMany({
      where: { edition_id: req.params.id },
      include: {
        checkpoints: {
          select: { id: true, nom: true, points: true, latitude: true, longitude: true },
        },
        _count: { select: { completes: true } },
      },
      orderBy: { created_at: 'asc' },
    });
    res.json(itineraires);
  } catch (err) {
    next(err);
  }
});

// POST /editions/:id/itineraires
itinerairesRouter.post(
  '/:id/itineraires',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
      if (!edition) throw new AppError(404, 'Édition introuvable');

      const body = CreateItineraireThematiqueSchema.parse(req.body);
      const { checkpoint_ids, ...rest } = body;

      const itineraire = await prisma.itineraireThematique.create({
        data: {
          ...rest,
          edition_id: req.params.id,
          checkpoints: checkpoint_ids.length
            ? { connect: checkpoint_ids.map((id) => ({ id })) }
            : undefined,
        },
        include: { checkpoints: { select: { id: true, nom: true, points: true } } },
      });

      res.status(201).json(itineraire);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /editions/:id/itineraires/:iId
itinerairesRouter.patch(
  '/:id/itineraires/:iId',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const existing = await prisma.itineraireThematique.findUnique({
        where: { id: req.params.iId },
      });
      if (!existing || existing.edition_id !== req.params.id) {
        throw new AppError(404, 'Itinéraire introuvable');
      }

      const body = CreateItineraireThematiqueSchema.partial().parse(req.body);
      const { checkpoint_ids, ...rest } = body;

      const updated = await prisma.itineraireThematique.update({
        where: { id: req.params.iId },
        data: {
          ...rest,
          ...(checkpoint_ids !== undefined
            ? { checkpoints: { set: checkpoint_ids.map((id) => ({ id })) } }
            : {}),
        },
        include: { checkpoints: { select: { id: true, nom: true, points: true } } },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /editions/:id/itineraires/:iId
itinerairesRouter.delete(
  '/:id/itineraires/:iId',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const existing = await prisma.itineraireThematique.findUnique({
        where: { id: req.params.iId },
      });
      if (!existing || existing.edition_id !== req.params.id) {
        throw new AppError(404, 'Itinéraire introuvable');
      }

      await prisma.itineraireThematique.delete({ where: { id: req.params.iId } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
