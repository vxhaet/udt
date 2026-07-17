import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    const token = document.cookie.match(/udt_token=([^;]+)/)?.[1] ?? '';
    _socket = io(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001', {
      auth: { token },
      autoConnect: false,
    });
  }
  return _socket;
}

export function resetSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
