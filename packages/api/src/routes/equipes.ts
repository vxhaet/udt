import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@udt/db';
import { JoinEquipeSchema } from '@udt/shared';
import type { ParticipantTokenPayload } from '@udt/shared';
import { requireParticipant, optionalAuth } from '../middleware/auth';
import { AppError } from '../middleware/error';
import Stripe from 'stripe';
import { sendCodeToTeam } from '../services/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const equipesRouter: Router = Router();

function signParticipantToken(payload: ParticipantTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
  });
}

// POST /equipes/join — Connexion participant via code + email
equipesRouter.post('/join', async (req, res, next) => {
  try {
    const body = JoinEquipeSchema.parse(req.body);

    const equipe = await prisma.equipe.findUnique({
      where: { code_acces: body.code_acces },
      include: { participants: true, edition: { select: { id: true } } },
    });

    if (!equipe) throw new AppError(404, "Code d'acces invalide");

    const participant = equipe.participants.find(
      (p) => p.email.toLowerCase() === body.email.toLowerCase(),
    );
    if (!participant) {
      throw new AppError(403, 'Email non autorise pour cette equipe');
    }

    const token = signParticipantToken({
      type: 'participant',
      participantId: participant.id,
      equipeId: equipe.id,
      editionId: equipe.edition_id,
    });

    res.json({
      participant: { id: participant.id, nom: participant.nom, prenom: participant.prenom },
      equipe: { id: equipe.id, nom: equipe.nom },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /equipes/:id — Detail equipe (participant de l'equipe)
equipesRouter.get('/:id', requireParticipant(), async (req, res, next) => {
  try {
    const { equipeId, editionId } = req.participant!;
    if (equipeId !== req.params.id) {
      throw new AppError(403, 'Acces non autorise a cette equipe');
    }

    const equipe = await prisma.equipe.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          select: { id: true, nom: true, prenom: true, strava_athlete_id: true },
        },
        format_course: { select: { id: true, nom: true, duree_minutes: true, date_depart: true } },
      },
    });
    if (!equipe) throw new AppError(404, 'Equipe introuvable');

    // Masquer le score live si gel actif (per-format)
    if (equipe.format_course_id) {
      const fmt = await prisma.formatCourse.findUnique({ where: { id: equipe.format_course_id }, select: { gel_actif: true, classement_gele: true } });
      if (fmt?.gel_actif && fmt.classement_gele) {
        const snapshot = fmt.classement_gele as Array<{ equipeId: string; scoreTotal: number; distanceVolOiseauKm: number }>;
        const frozen = snapshot.find((e) => e.equipeId === equipe.id);
        if (frozen) {
          (equipe as any).score_total = frozen.scoreTotal;
          (equipe as any).distance_vol_oiseau_km = frozen.distanceVolOiseauKm;
        }
      }
    } else {
      const edition = await prisma.edition.findUnique({ where: { id: editionId }, select: { gel_actif: true, classement_gele: true } });
      if (edition?.gel_actif && edition.classement_gele) {
        const snapshot = edition.classement_gele as Array<{ equipeId: string; scoreTotal: number; distanceVolOiseauKm: number }>;
        const frozen = snapshot.find((e) => e.equipeId === equipe.id);
        if (frozen) {
          (equipe as any).score_total = frozen.scoreTotal;
          (equipe as any).distance_vol_oiseau_km = frozen.distanceVolOiseauKm;
        }
      }
    }

    res.json(equipe);
  } catch (err) {
    next(err);
  }
});

// GET /equipes/:id/validations — Detail des checkpoints valides (pour le classement)
equipesRouter.get('/:id/validations', optionalAuth(), async (req, res, next) => {
  try {
    const equipe = await prisma.equipe.findUnique({
      where: { id: req.params.id },
      select: { id: true, nom: true, score_total: true, edition_id: true, format_course_id: true },
    });
    if (!equipe) throw new AppError(404, 'Equipe introuvable');

    const isAdmin = !!req.user;

    // Check gel (per-format or edition-level)
    let gelActif = false;
    let gelSnapshot: Array<{ equipeId: string; scoreTotal: number; nbCheckpoints: number }> | null = null;
    if (!isAdmin && equipe.format_course_id) {
      const fmt = await prisma.formatCourse.findUnique({ where: { id: equipe.format_course_id }, select: { gel_actif: true, classement_gele: true } });
      if (fmt?.gel_actif && fmt.classement_gele) { gelActif = true; gelSnapshot = fmt.classement_gele as any; }
    }
    if (!gelActif && !isAdmin) {
      const edition = await prisma.edition.findUnique({ where: { id: equipe.edition_id }, select: { gel_actif: true, classement_gele: true } });
      if (edition?.gel_actif && edition.classement_gele) { gelActif = true; gelSnapshot = edition.classement_gele as any; }
    }

    const validations = await prisma.validation.findMany({
      where: { equipe_id: req.params.id, statut: 'APPROUVE' },
      select: {
        id: true,
        points_accordes: true,
        validated_at: true,
        photo_url: true,
        checkpoint: { select: { nom: true, points: true } },
      },
      orderBy: { validated_at: 'asc' },
    });

    let scoreTotal = equipe.score_total;
    let filteredValidations = validations;

    if (gelActif && gelSnapshot) {
      const frozen = gelSnapshot.find((e) => e.equipeId === equipe.id);
      if (frozen) {
        scoreTotal = frozen.scoreTotal;
        filteredValidations = validations.slice(0, frozen.nbCheckpoints);
      }
    }

    res.json({
      equipeId: equipe.id,
      nom: equipe.nom,
      scoreTotal,
      validations: filteredValidations.map((v) => ({
        id: v.id,
        checkpointNom: v.checkpoint.nom,
        checkpointPoints: v.checkpoint.points,
        pointsAccordes: v.points_accordes,
        photoUrl: v.photo_url,
        validatedAt: v.validated_at.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /equipes/stripe/webhook — Confirmer l'equipe apres paiement
equipesRouter.post('/stripe/webhook', async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      return res.status(400).json({ error: 'Signature Stripe invalide' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const equipeId = session.metadata?.equipeId;
      if (equipeId) {
        const equipe = await prisma.equipe.update({
          where: { id: equipeId },
          data: { statut: 'CONFIRMEE' },
          include: { participants: true },
        });

        sendCodeToTeam(
          equipe.participants.map((p) => ({ email: p.email, prenom: p.prenom })),
          equipe.code_acces,
          equipe.nom,
        ).catch(console.error);
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /equipes/:id/push-token — Enregistrer le token Expo
equipesRouter.patch('/:id/push-token', requireParticipant(), async (req, res, next) => {
  try {
    const { participantId, equipeId } = req.participant!;
    if (equipeId !== req.params.id) throw new AppError(403, 'Acces non autorise');

    const { expo_push_token } = req.body as { expo_push_token: string };
    await prisma.participant.update({
      where: { id: participantId },
      data: { expo_push_token },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
