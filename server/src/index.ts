import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import { config } from './config.js';
import { RoomManager } from './rooms/roomManager.js';
import { registerHandlers } from './socket/registerHandlers.js';

const app = express();
app.use(cors({ origin: config.clientOrigins }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'poker-server' });
});

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: config.clientOrigins,
  },
});

let roomManager: RoomManager;

const emitRoomState = (roomId: string): void => {
  if (!roomManager) return;
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  for (const player of room.state.players) {
    const socketId = roomManager.getSocketId(roomId, player.id);
    if (!socketId) continue;
    const view = roomManager.buildView(roomId, player.id);
    if (!view) continue;
    io.to(socketId).emit('room:state', view);
  }
};

const emitBlindLevelChange = (payload: { roomId: string; levelIndex: number; sb: number; bb: number; nextLevelAt: number | null }): void => {
  io.to(payload.roomId).emit('room:blind-level-changed', payload);
};

roomManager = new RoomManager(
  {
    minPlayersToStart: config.minPlayersToStart,
    turnTimeoutSeconds: config.turnTimeoutSeconds,
    smallBlind: config.defaultSmallBlind,
    bigBlind: config.defaultBigBlind,
  },
  emitRoomState,
  emitBlindLevelChange,
);

app.get('/public-rooms', (_req, res) => {
  res.json({ rooms: roomManager.listPublicRooms() });
});

registerHandlers(io, roomManager);

server.listen(config.port, () => {
  console.log(`Poker server listening on :${config.port}`);
});
