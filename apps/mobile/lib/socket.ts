import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function initSocket(token: string): Socket {
  if (_socket) {
    _socket.disconnect();
  }
  _socket = io(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001', {
    auth: { token },
    autoConnect: false,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });
  return _socket;
}

export function getSocket(): Socket | null {
  return _socket;
}

export function resetSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
