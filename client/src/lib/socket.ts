import { io } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import type { Socket } from 'socket.io-client';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
  autoConnect: true,
  transports: ['websocket'],
});
