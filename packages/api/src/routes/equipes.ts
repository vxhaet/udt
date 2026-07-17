import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@udt/db';
import { CreateEquipeSchema, JoinEquipeSchema } from '@udt/shared';
import type { ParticipantTokenPayload } from '@udt/shared';
import { requireParticipant, requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';
import Stripe from 'stripe';
import { sendConfirmationEmail } from '../services/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const equipesRouter = Router();

function generateCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function generateUniqueCode(): Promise<string> {
  let code: string;
  let exists: boolean;
  do {
    code = generateCode();
    exists = !!(await prisma.equipe.findUnique({ where: { code_acces: code } }));
  } while (exists);
  return code;
}

function signParticipantToken(payload: ParticipantTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
  });
}

// POST /equipes — Capitaine crée une équipe
equipesRouter.post('/', async (req, res, next) => {
  try {
    const body = CreateEquipeSchema.parse(req.body);

    const edition = await prisma.edition.findUnique({ where: { id: body.editionId } });
    if (!edition) throw new AppError(404, 'Édition introuvable');
    if (edition.statut !== 'INSCRIPTION') {
      throw new AppError(400, 'Les inscriptions ne sont pas ouvertes pour cette édition');
    }

    const nbEquipes = await prisma.equipe.count({ where: { edition_id: body.editionId } });
    if (nbEquipes >= edition.nb_equipes_max) {
      throw new AppError(400, 'Nombre maximum d\'équipes atteint');
    }

    const code_acces = await generateUniqueCode();

    const equipe = await prisma.equipe.create({
      data: {
        edition_id: body.editionId,
        nom: body.nom,
        code_acces,
        participants: {
          create: {
            nom: body.capitaine.nom,
            prenom: body.capitaine.prenom,
            email: body.capitaine.email,
            role: 'CAPITAINE',
          },
        },
      },
      include: { participants: true },
    });

    const capitaine = equipe.participants[0];
    const token = signParticipantToken({
      type: 'participant',
      participantId: capitaine.id,
      equipeId: equipe.id,
      editionId: body.editionId,
    });

    // Créer une session de paiement Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/inscription/success?equipe=${equipe.id}`,
      cancel_url: `${process.env.FRONTEND_URL}/inscription/cancel`,
      metadata: { equipeId: equipe.id, editionId: body.editionId },
    });

    res.status(201).json({
      equipe: { id: equipe.id, nom: equipe.nom, code_acces: equipe.code_acces },
      token,
      checkoutUrl: session.url,
    });
  } catch (err) {
    next(err);
  }
});

// POST /equipes/join — Membre rejoint une équipe via code
equipesRouter.post('/join', async (req, res, next) => {
  try {
    const body = JoinEquipeSchema.parse(req.body);

    const equipe = await prisma.equipe.findUnique({
      where: { code_acces: body.code_acces },
      include: {
        _count: { select: { participants: true } },
        edition: true,
      },
    });

    if (!equipe) throw new AppError(404, 'Code d\'accès invalide');
    if (equipe.edition.statut !== 'INSCRIPTION') {
      throw new AppError(400, 'Les inscriptions ne sont pas ouvertes');
    }
    if (equipe._count.participants >= 4) {
      throw new AppError(400, 'L\'équipe est complète (4 participants maximum)');
    }

    const participant = await prisma.participant.create({
      data: {
        equipe_id: equipe.id,
        nom: body.nom,
        prenom: body.prenom,
        email: body.email,
        role: 'MEMBRE',
      },
    });

    const token = signParticipantToken({
      type: 'participant',
      participantId: participant.id,
      equipeId: equipe.id,
      editionId: equipe.edition_id,
    });

    res.status(201).json({
      participant: { id: participant.id, nom: participant.nom, prenom: participant.prenom, role: participant.role },
      equipe: { id: equipe.id, nom: equipe.nom },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /equipes/:id — Détail équipe (participant de l'équipe ou admin)
equipesRouter.get('/:id', requireParticipant(), async (req, res, next) => {
  try {
    const { equipeId } = req.participant!;
    if (equipeId !== req.params.id) {
      throw new AppError(403, 'Accès non autorisé à cette équipe');
    }

    const equipe = await prisma.equipe.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          select: { id: true, nom: true, prenom: true, role: true, strava_athlete_id: true },
        },
      },
    });
    if (!equipe) throw new AppError(404, 'Équipe introuvable');

    res.json(equipe);
  } catch (err) {
    next(err);
  }
});

// POST /equipes/stripe/webhook — Confirmer l'équipe après paiement
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
          include: { format_course: true },
        });
        if (equipe.email_capitaine) {
          sendConfirmationEmail({
            email: equipe.email_capitaine,
            nom_equipe: equipe.nom,
            code_acces: equipe.code_acces,
            emails_membres: equipe.emails_membres,
            nom_format: equipe.format_course?.nom,
          }).catch(console.error);
        }
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
    if (equipeId !== req.params.id) throw new AppError(403, 'Accès non autorisé');

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
