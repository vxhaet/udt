import type { Server as HttpServer } from 'http';
import { Server as SocketServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { TokenPayload } from '@udt/shared';
import { redis, keys } from '../config/redis';

let io: SocketServer;

type AuthSocket = Socket & { tokenPayload: TokenPayload };

export function initWebSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Token manquant'));
    try {
      (socket as AuthSocket).tokenPayload = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as TokenPayload;
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const { tokenPayload } = socket as AuthSocket;

    // Rejoindre les rooms d'une édition
    socket.on('join:edition', (editionId: string) => {
      if (typeof editionId !== 'string') return;

      if (tokenPayload.type === 'user') {
        // Admin : reçoit tout, même pendant le gel
        socket.join(`admin:${editionId}`);
        socket.join(`edition:${editionId}`);
      } else if (tokenPayload.type === 'participant') {
        if (tokenPayload.editionId !== editionId) return;
        socket.join(`participant:${editionId}`);
        socket.join(`edition:${editionId}`);
        socket.join(`equipe:${tokenPayload.equipeId}`);
      }
    });

    socket.on('leave:edition', (editionId: string) => {
      socket.leave(`admin:${editionId}`);
      socket.leave(`participant:${editionId}`);
      socket.leave(`edition:${editionId}`);
      if (tokenPayload.type === 'participant') {
        socket.leave(`equipe:${tokenPayload.equipeId}`);
      }
    });
  });

  console.log('[WebSocket] Initialized');
  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('WebSocket not initialized');
  return io;
}

// Émet vers participants ET admins (en respectant le gel pour les participants)
export async function emitToEdition(
  editionId: string,
  event: string,
  data: unknown,
): Promise<void> {
  const socket = getIO();
  const gelActive = await redis.get(keys.gelActive(editionId));

  // Les admins/QG reçoivent toujours
  socket.to(`admin:${editionId}`).emit(event, data);

  // Les participants ne reçoivent que si le gel n'est pas actif
  if (!gelActive) {
    socket.to(`participant:${editionId}`).emit(event, data);
  }
}

// Émet uniquement à une équipe spécifique
export function emitToEquipe(equipeId: string, event: string, data: unknown): void {
  getIO().to(`equipe:${equipeId}`).emit(event, data);
}

// Émet à tous (admin + participants) sans restriction de gel
export function emitToAll(editionId: string, event: string, data: unknown): void {
  getIO().to(`edition:${editionId}`).emit(event, data);
}

// Émet uniquement aux admins
export function emitToAdmins(editionId: string, event: string, data: unknown): void {
  getIO().to(`admin:${editionId}`).emit(event, data);
}
