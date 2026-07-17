import { Router } from 'express';
import axios from 'axios';
import { prisma } from '@udt/db';
import { requireParticipant, requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { syncStravaPerformances, syncEditionStravaPerformances } from '../services/strava';

export const stravaRouter = Router();

// GET /strava/auth — Redirige vers l'OAuth Strava (flow web)
stravaRouter.get('/auth', requireParticipant(), (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state: req.participant!.participantId,
  });
  res.redirect(`https://www.strava.com/oauth/authorize?${params}`);
});

// GET /strava/callback — Échange le code contre un access token (flow web)
stravaRouter.get('/callback', async (req, res, next) => {
  try {
    const { code, state: participantId, error } = req.query as Record<string, string>;

    if (error === 'access_denied') {
      return res.redirect(`${process.env.FRONTEND_URL}/strava/denied`);
    }
    if (!code || !participantId) throw new AppError(400, 'Paramètres manquants');

    const tokenResponse = await axios.post<{
      athlete: { id: number };
      access_token: string;
      refresh_token: string;
    }>('https://www.strava.com/oauth/token', {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    const { athlete, access_token, refresh_token } = tokenResponse.data;

    await prisma.participant.update({
      where: { id: participantId },
      data: {
        strava_athlete_id: String(athlete.id),
        strava_access_token: access_token,
        strava_refresh_token: refresh_token,
      },
    });

    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Strava connecté — UDT</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #030712; color: #f1f5f9;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .card {
      background: #0f172a; border: 1px solid #1e293b; border-radius: 16px;
      padding: 32px 24px; max-width: 360px; width: 100%; text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #22c55e; margin-bottom: 8px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; }
    .hint {
      margin-top: 20px; background: #1e293b; border-radius: 10px;
      padding: 12px 16px; font-size: 13px; color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Compte Strava connecté !</h1>
    <p>Vos performances sur les segments chronométrés seront synchronisées automatiquement.</p>
    <div class="hint">Retournez dans l'application UDT pour continuer.</div>
  </div>
</body>
</html>`);
  } catch (err) {
    next(err);
  }
});

// GET /strava/status — Statut Strava du participant connecté
stravaRouter.get('/status', requireParticipant(), async (req, res, next) => {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: req.participant!.participantId },
      select: { strava_athlete_id: true },
    });
    res.json({ connected: !!participant?.strava_athlete_id });
  } catch (err) {
    next(err);
  }
});

// POST /strava/auth — Échange le code OAuth Strava depuis l'app mobile
stravaRouter.post('/auth', requireParticipant(), async (req, res, next) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) throw new AppError(400, 'Code manquant');

    const tokenResponse = await axios.post<{
      athlete: { id: number; firstname: string; lastname: string };
      access_token: string;
      refresh_token: string;
    }>('https://www.strava.com/oauth/token', {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    const { athlete, access_token, refresh_token } = tokenResponse.data;

    await prisma.participant.update({
      where: { id: req.participant!.participantId },
      data: {
        strava_athlete_id: String(athlete.id),
        strava_access_token: access_token,
        strava_refresh_token: refresh_token,
      },
    });

    res.json({
      athlete_id: athlete.id,
      athlete_name: `${athlete.firstname} ${athlete.lastname}`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /strava/sync/:editionId — Synchronisation admin de tous les participants
stravaRouter.post('/sync/:editionId', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    await syncEditionStravaPerformances(req.params.editionId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /strava/sync-final/:editionId — Synchronisation finale après la course
stravaRouter.post('/sync-final/:editionId', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    await syncEditionStravaPerformances(req.params.editionId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /strava/segments/:editionId — Liste les segments Strava d'une édition
stravaRouter.get('/segments/:editionId', requireUser(), async (req, res, next) => {
  try {
    const segments = await prisma.segmentStrava.findMany({
      where: { edition_id: req.params.editionId },
      include: {
        performances: {
          include: {
            participant: {
              select: {
                nom: true,
                prenom: true,
                equipe: { select: { nom: true } },
              },
            },
          },
          orderBy: { classement: 'asc' },
        },
      },
    });
    res.json(segments);
  } catch (err) {
    next(err);
  }
});

// POST /strava/segments/:editionId — Ajouter un segment Strava
stravaRouter.post('/segments/:editionId', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    const { strava_segment_id, nom, description, points_premier, points_second, points_troisieme } =
      req.body as {
        strava_segment_id: string;
        nom: string;
        description?: string;
        points_premier: number;
        points_second: number;
        points_troisieme: number;
      };

    if (!strava_segment_id || !nom) throw new AppError(400, 'strava_segment_id et nom requis');

    const segment = await prisma.segmentStrava.create({
      data: {
        edition_id: req.params.editionId,
        strava_segment_id,
        nom,
        description,
        points_premier: points_premier ?? 0,
        points_second: points_second ?? 0,
        points_troisieme: points_troisieme ?? 0,
      },
    });
    res.status(201).json(segment);
  } catch (err) {
    next(err);
  }
});

// DELETE /strava/segments/:segmentId — Supprimer un segment Strava
stravaRouter.delete('/segments/:segmentId', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    await prisma.segmentStrava.delete({ where: { id: req.params.segmentId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /strava/webhook — Vérification du webhook par Strava
stravaRouter.get('/webhook', (req, res) => {
  const {
    'hub.mode': mode,
    'hub.verify_token': verifyToken,
    'hub.challenge': challenge,
  } = req.query as Record<string, string>;

  if (mode === 'subscribe' && verifyToken === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return res.json({ 'hub.challenge': challenge });
  }
  res.status(403).json({ error: 'Forbidden' });
});

// POST /strava/webhook — Réception des événements Strava
stravaRouter.post('/webhook', async (req, res, next) => {
  try {
    const event = req.body as {
      object_type: string;
      aspect_type: string;
      owner_id: number;
      object_id: number;
    };

    // Répondre immédiatement à Strava (délai max 2s)
    res.status(200).send('EVENT_RECEIVED');

    if (event.object_type === 'activity' && event.aspect_type === 'create') {
      syncStravaPerformances(event.owner_id, event.object_id).catch((err) =>
        console.error('[Strava] Webhook sync error:', err),
      );
    }
  } catch (err) {
    next(err);
  }
});
