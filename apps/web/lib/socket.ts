import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function initSocket(token: string): Socket {
  if (socket) {
    // Si deconnecte, reconnecter
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(API_URL, {
    auth: { token },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
