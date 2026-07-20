import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@udt/db';
import { InscriptionSchema } from '@udt/shared';
import type { ParticipantTokenPayload } from '@udt/shared';
import { AppError } from '../middleware/error';
import Stripe from 'stripe';
import { sendConfirmationEmail } from '../services/email';

export const inscriptionsRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function generateUniqueCode(): Promise<string> {
  let code: string;
  let exists: boolean;
  do {
    code = Math.random().toString(36).slice(2, 10).toUpperCase();
    exists = !!(await prisma.equipe.findUnique({ where: { code_acces: code } }));
  } while (exists);
  return code;
}

function signParticipantToken(payload: ParticipantTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
  });
}

// POST /inscriptions/:editionId — Inscription publique (web ou mobile)
inscriptionsRouter.post('/:editionId', async (req, res, next) => {
  try {
    const body = InscriptionSchema.parse(req.body);

    const edition = await prisma.edition.findUnique({ where: { id: req.params.editionId } });
    if (!edition) throw new AppError(404, 'Édition introuvable');
    if (edition.statut !== 'INSCRIPTION') {
      throw new AppError(400, 'Les inscriptions ne sont pas ouvertes pour cette édition');
    }

    const nbEquipes = await prisma.equipe.count({ where: { edition_id: req.params.editionId } });
    if (nbEquipes >= edition.nb_equipes_max) {
      throw new AppError(400, "Nombre maximum d'équipes atteint");
    }

    // Validation du format de course
    const formats = await prisma.formatCourse.findMany({
      where: { edition_id: req.params.editionId },
    });

    let nomFormat: string | undefined;

    if (formats.length > 0) {
      if (!body.format_course_id) {
        throw new AppError(400, 'Veuillez choisir un format de course');
      }
      const format = formats.find((f) => f.id === body.format_course_id);
      if (!format) {
        throw new AppError(400, 'Format de course invalide pour cette édition');
      }
      nomFormat = format.nom;
    }

    const code_acces = await generateUniqueCode();

    const equipe = await prisma.equipe.create({
      data: {
        edition_id: req.params.editionId,
        nom: body.nom_equipe,
        code_acces,
        email_capitaine: body.capitaine.email,
        emails_membres: body.emails_membres,
        format_course_id: body.format_course_id ?? null,
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
      editionId: req.params.editionId,
    });

    // Inscription gratuite → confirmation immédiate
    if (edition.prix_equipe === 0) {
      await prisma.equipe.update({ where: { id: equipe.id }, data: { statut: 'CONFIRMEE' } });

      sendConfirmationEmail({
        email: body.capitaine.email,
        nom_equipe: body.nom_equipe,
        code_acces,
        emails_membres: body.emails_membres,
        nom_format: nomFormat,
        date_course: edition.date_course,
      }).catch(console.error);

      return res.status(201).json({
        code_acces,
        token,
        equipe: { id: equipe.id, nom: equipe.nom },
      });
    }

    // Inscription payante → session Stripe
    const productName = nomFormat
      ? `Inscription UDT — ${edition.nom} (${nomFormat})`
      : `Inscription UDT — ${edition.nom}`;

    const webBase = process.env.WEB_URL ?? 'http://localhost:3002';
    const editionSlug = edition.slug ?? req.params.editionId;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: productName },
            unit_amount: edition.prix_equipe,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${webBase}/${editionSlug}/inscription/success?code=${code_acces}`,
      cancel_url: `${webBase}/${editionSlug}/inscription`,
      metadata: { equipeId: equipe.id, editionId: req.params.editionId },
    });

    res.status(201).json({
      checkoutUrl: session.url,
      token,
      equipe: { id: equipe.id, nom: equipe.nom },
    });
  } catch (err) {
    next(err);
  }
});
