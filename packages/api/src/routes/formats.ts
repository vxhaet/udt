import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateFormatCourseSchema } from '@udt/shared';
import { requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';

export const formatsRouter: Router = Router();

// GET /editions/:id/formats — public (utilisé par la page d'inscription)
formatsRouter.get('/:id/formats', async (req, res, next) => {
  try {
    const formats = await prisma.formatCourse.findMany({
      where: { edition_id: req.params.id },
      orderBy: { created_at: 'asc' },
    });
    res.json(formats);
  } catch (err) {
    next(err);
  }
});

// POST /editions/:id/formats
formatsRouter.post(
  '/:id/formats',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
      if (!edition) throw new AppError(404, 'Édition introuvable');

      const body = CreateFormatCourseSchema.parse(req.body);
      const { date_depart, devoilement_depart, devoilement_checkpoints, devoilement_points } = req.body as Record<string, string | null>;
      const format = await prisma.formatCourse.create({
        data: {
          ...body,
          edition_id: req.params.id,
          date_depart: date_depart ? new Date(date_depart) : null,
          devoilement_depart: devoilement_depart ? new Date(devoilement_depart) : null,
          devoilement_checkpoints: devoilement_checkpoints ? new Date(devoilement_checkpoints) : null,
          devoilement_points: devoilement_points ? new Date(devoilement_points) : null,
        },
      });
      res.status(201).json(format);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /editions/:id/formats/:fId
formatsRouter.patch(
  '/:id/formats/:fId',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const existing = await prisma.formatCourse.findUnique({ where: { id: req.params.fId } });
      if (!existing || existing.edition_id !== req.params.id) {
        throw new AppError(404, 'Format introuvable');
      }

      const body = CreateFormatCourseSchema.partial().parse(req.body);
      const { date_depart, devoilement_depart, devoilement_checkpoints, devoilement_points } = req.body as Record<string, string | null | undefined>;
      const data: Record<string, unknown> = { ...body };
      if (date_depart !== undefined) data.date_depart = date_depart ? new Date(date_depart) : null;
      if (devoilement_depart !== undefined) data.devoilement_depart = devoilement_depart ? new Date(devoilement_depart) : null;
      if (devoilement_checkpoints !== undefined) data.devoilement_checkpoints = devoilement_checkpoints ? new Date(devoilement_checkpoints) : null;
      if (devoilement_points !== undefined) data.devoilement_points = devoilement_points ? new Date(devoilement_points) : null;
      const updated = await prisma.formatCourse.update({
        where: { id: req.params.fId },
        data: data as any,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /editions/:id/formats/:fId
formatsRouter.delete(
  '/:id/formats/:fId',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const existing = await prisma.formatCourse.findUnique({ where: { id: req.params.fId } });
      if (!existing || existing.edition_id !== req.params.id) {
        throw new AppError(404, 'Format introuvable');
      }

      await prisma.formatCourse.delete({ where: { id: req.params.fId } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
