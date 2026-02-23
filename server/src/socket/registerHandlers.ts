import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import type { Socket } from 'socket.io';
import { RoomManager } from '../rooms/roomManager.js';

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type PokerSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

export function registerHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>, rooms: RoomManager): void {
  const emitRoomState = (roomId: string): void => {
    const room = rooms.getRoom(roomId);
    if (!room) return;

    for (const player of room.state.players) {
      const socketId = rooms.getSocketId(roomId, player.id);
      if (!socketId) continue;
      const view = rooms.buildView(roomId, player.id);
      if (!view) continue;
      io.to(socketId).emit('room:state', view);
    }
  };

  io.on('connection', (socket: PokerSocket) => {
    socket.on('room:create', (input, cb) => {
      const result = rooms.createRoom(input.nickname, input.config ?? {});
      if (!result.ok || !result.roomId || !result.playerId || !result.sessionToken) {
        cb({ ok: false, error: result.error ?? 'Failed to create room' });
        return;
      }

      socket.join(result.roomId);
      socket.data.roomId = result.roomId;
      socket.data.playerId = result.playerId;
      rooms.bindSocket(result.roomId, result.playerId, socket.id);

      cb({ ok: true, roomId: result.roomId });
      socket.emit('room:joined', {
        roomId: result.roomId,
        playerId: result.playerId,
        sessionToken: result.sessionToken,
      });
      emitRoomState(result.roomId);
    });

    socket.on('room:join', (input, cb) => {
      const result = rooms.joinRoom(input.roomId, input.nickname, input.sessionToken);
      if (!result.ok || !result.roomId || !result.playerId || !result.sessionToken) {
        cb({ ok: false, error: result.error ?? 'Failed to join room' });
        return;
      }

      socket.join(result.roomId);
      socket.data.roomId = result.roomId;
      socket.data.playerId = result.playerId;
      rooms.bindSocket(result.roomId, result.playerId, socket.id);

      cb({ ok: true, roomId: result.roomId });
      socket.emit('room:joined', {
        roomId: result.roomId,
        playerId: result.playerId,
        sessionToken: result.sessionToken,
      });
      emitRoomState(result.roomId);
    });

    socket.on('room:leave', (roomId) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      rooms.leaveRoom(roomId, playerId);
      socket.leave(roomId);
      socket.data.roomId = undefined;
      socket.data.playerId = undefined;
    });

    socket.on('room:start', (roomId) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      const result = rooms.startHand(roomId, playerId);
      if (!result.ok) {
        socket.emit('room:error', result.error ?? 'Unable to start hand');
      }
    });

    socket.on('room:reset', (roomId) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      const result = rooms.resetRoom(roomId, playerId);
      if (!result.ok) {
        socket.emit('room:error', result.error ?? 'Unable to reset room');
      }
    });

    socket.on('room:kick', ({ roomId, targetPlayerId }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      const result = rooms.kickPlayer(roomId, playerId, targetPlayerId);
      if (!result.ok) {
        socket.emit('room:error', result.error ?? 'Unable to kick player');
      }
    });

    socket.on('game:action', (input) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = rooms.applyAction(input.roomId, playerId, input.action);
      if (!result.ok) {
        socket.emit('room:error', result.error ?? 'Action rejected');
      }
    });

    socket.on('disconnect', () => {
      rooms.unbindSocket(socket.id);
    });
  });
}
