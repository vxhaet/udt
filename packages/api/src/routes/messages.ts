import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateMessageSchema } from '@udt/shared';
import type { MessageQG } from '@udt/shared';
import { requireUser, optionalAuth } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { emitToAll } from '../ws';
import { redis } from '../config/redis';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

export const messagesRouter: Router = Router();

function activeMessageKey(editionId: string) {
  return `udt:edition:${editionId}:active_message`;
}

function messageHistoryKey(editionId: string) {
  return `udt:edition:${editionId}:message_history`;
}

// GET /editions/:id/messages/active — Dernier message actif
messagesRouter.get('/:id/messages/active', optionalAuth(), async (req, res, next) => {
  try {
    const raw = await redis.get(activeMessageKey(req.params.id));
    if (!raw) return res.json(null);
    res.json(JSON.parse(raw));
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id/messages — Historique des messages
messagesRouter.get('/:id/messages', requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'), async (req, res, next) => {
  try {
    const raw = await redis.lRange(messageHistoryKey(req.params.id), 0, 49);
    const messages = raw.map((r) => JSON.parse(r));
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// DELETE /editions/:id/messages/active — Arreter la diffusion du message actif
messagesRouter.delete('/:id/messages/active', requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'), async (req, res, next) => {
  try {
    await redis.del(activeMessageKey(req.params.id));
    emitToAll(req.params.id, 'message:dismiss', {});
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /editions/:id/messages
messagesRouter.post('/:id/messages', requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'), async (req, res, next) => {
  try {
    const body = CreateMessageSchema.parse(req.body);
    const editionId = req.params.id;

    const edition = await prisma.edition.findUnique({ where: { id: editionId } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const message: MessageQG = {
      id: crypto.randomUUID(),
      editionId,
      contenu: body.contenu,
      type: body.type,
      timestamp: new Date().toISOString(),
      auteurId: req.user!.userId,
    };

    // Stocker le message actif dans Redis (TTL 4h) + historique
    await redis.set(activeMessageKey(editionId), JSON.stringify(message), { EX: 4 * 3600 });
    await redis.lPush(messageHistoryKey(editionId), JSON.stringify(message));
    await redis.lTrim(messageHistoryKey(editionId), 0, 49); // garder les 50 derniers

    // Broadcast WebSocket à tous (participants + admins)
    emitToAll(editionId, 'message:qg', message);

    // Envoyer notifications push Expo
    const participants = await prisma.participant.findMany({
      where: {
        equipe: { edition_id: editionId },
        expo_push_token: { not: null },
      },
      select: { expo_push_token: true },
    });

    const pushMessages: ExpoPushMessage[] = participants
      .filter((p) => p.expo_push_token && Expo.isExpoPushToken(p.expo_push_token))
      .map((p) => ({
        to: p.expo_push_token!,
        sound: 'default' as const,
        title: `UDT — ${body.type}`,
        body: body.contenu,
        data: { type: body.type, editionId },
      }));

    if (pushMessages.length > 0) {
      const chunks = expo.chunkPushNotifications(pushMessages);
      for (const chunk of chunks) {
        expo.sendPushNotificationsAsync(chunk).catch((err) =>
          console.error('[Push] Error sending notifications:', err),
        );
      }
    }

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});
