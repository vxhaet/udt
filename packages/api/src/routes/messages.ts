import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateMessageSchema } from '@udt/shared';
import type { MessageQG } from '@udt/shared';
import { requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { emitToAll } from '../ws';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

export const messagesRouter: Router = Router();

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
