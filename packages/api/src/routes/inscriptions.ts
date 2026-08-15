import { Router } from 'express';
import { prisma } from '@udt/db';
import { InscriptionSchema } from '@udt/shared';
import { requireUser, requireParticipant } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { sendCodeToTeam } from '../services/email';

export const inscriptionsRouter: Router = Router();

async function generateUniqueCode(): Promise<string> {
  let code: string;
  let exists: boolean;
  do {
    code = Math.random().toString(36).slice(2, 10).toUpperCase();
    exists = !!(await prisma.equipe.findUnique({ where: { code_acces: code } }));
  } while (exists);
  return code;
}

// POST /inscriptions/:editionId — Inscription par l'organisateur (back-office)
inscriptionsRouter.post(
  '/:editionId',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const body = InscriptionSchema.parse(req.body);

      const edition = await prisma.edition.findUnique({ where: { id: req.params.editionId } });
      if (!edition) throw new AppError(404, 'Edition introuvable');
      if (edition.statut !== 'INSCRIPTION') {
        throw new AppError(400, 'Les inscriptions ne sont pas ouvertes pour cette edition');
      }

      const nbEquipes = await prisma.equipe.count({
        where: { edition_id: req.params.editionId, statut: { not: 'ANNULEE' } },
      });
      if (nbEquipes >= edition.nb_equipes_max) {
        throw new AppError(400, "Nombre maximum d'equipes atteint");
      }

      // Validation du format de course
      const formats = await prisma.formatCourse.findMany({
        where: { edition_id: req.params.editionId },
      });

      if (formats.length > 0) {
        if (!body.format_course_id) {
          throw new AppError(400, 'Veuillez choisir un format de course');
        }
        if (!formats.some((f) => f.id === body.format_course_id)) {
          throw new AppError(400, 'Format de course invalide pour cette edition');
        }
      }

      // Check email uniqueness within this edition
      const existingEmails = await prisma.participant.findMany({
        where: { equipe: { edition_id: req.params.editionId, statut: { not: 'ANNULEE' } } },
        select: { email: true },
      });
      const takenEmails = new Set(existingEmails.map((p) => p.email.toLowerCase()));
      for (const p of body.participants) {
        if (takenEmails.has(p.email.toLowerCase())) {
          throw new AppError(409, `L'email ${p.email} est deja utilise dans cette edition`);
        }
      }

      const code_acces = await generateUniqueCode();

      const equipe = await prisma.equipe.create({
        data: {
          edition_id: req.params.editionId,
          nom: body.nom_equipe,
          code_acces,
          format_course_id: body.format_course_id ?? null,
          statut: 'CONFIRMEE',
          participants: {
            create: body.participants.map((p) => ({
              nom: p.nom,
              prenom: p.prenom,
              email: p.email.toLowerCase(),
            })),
          },
        },
        include: { participants: true },
      });

      // Send access code to all participants
      sendCodeToTeam(
        body.participants.map((p) => ({ email: p.email, prenom: p.prenom })),
        code_acces,
        body.nom_equipe,
      ).catch(console.error);

      res.status(201).json({
        code_acces,
        equipe: { id: equipe.id, nom: equipe.nom },
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /:editionId/:equipeId/annuler — annuler une inscription
inscriptionsRouter.patch(
  '/:editionId/:equipeId/annuler',
  requireParticipant(),
  async (req, res, next) => {
    try {
      if (req.participant!.equipeId !== req.params.equipeId) {
        throw new AppError(403, 'Vous ne pouvez annuler que votre propre inscription');
      }

      const equipe = await prisma.equipe.findUnique({
        where: { id: req.params.equipeId },
      });
      if (!equipe) throw new AppError(404, 'Equipe introuvable');
      if (['EN_COURSE', 'ARRIVEE', 'DISQUALIFIEE'].includes(equipe.statut)) {
        throw new AppError(400, "Impossible d'annuler une equipe deja en course ou arrivee");
      }
      if (equipe.statut === 'ANNULEE') {
        throw new AppError(400, 'Cette inscription est deja annulee');
      }

      await prisma.equipe.update({
        where: { id: req.params.equipeId },
        data: { statut: 'ANNULEE' },
      });

      return res.status(200).json({ statut: 'ANNULEE' });
    } catch (err) {
      next(err);
    }
  },
);
