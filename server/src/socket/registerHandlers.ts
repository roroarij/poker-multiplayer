import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import type { Socket } from 'socket.io';
import { RoomManager } from '../rooms/roomManager.js';
import {
  parseCreateRoomInput,
  parseGameActionPayload,
  parseJoinRoomInput,
  parseKickPayload,
  parseRoomActionPayload,
  parseRoomId,
  parseUpdateSettingsPayload,
} from '../validation/schemas.js';

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type PokerSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Invalid payload';
}

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

  const emitPublicRooms = (): void => {
    io.emit('lobby:public-rooms', rooms.listPublicRooms());
  };

  io.on('connection', (socket: PokerSocket) => {
    socket.emit('lobby:public-rooms', rooms.listPublicRooms());

    socket.on('room:create', (rawInput, cb) => {
      try {
        const input = parseCreateRoomInput(rawInput);
        const result = rooms.createRoom(input.nickname, input.settings ?? {});
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
        emitPublicRooms();
      } catch (error) {
        cb({ ok: false, error: asErrorMessage(error) });
      }
    });

    socket.on('room:join', (rawInput, cb) => {
      try {
        const input = parseJoinRoomInput(rawInput);
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
        emitPublicRooms();
      } catch (error) {
        cb({ ok: false, error: asErrorMessage(error) });
      }
    });

    socket.on('room:leave', (rawRoomId) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const roomId = parseRoomId(rawRoomId);
        rooms.leaveRoom(roomId, playerId);
        socket.leave(roomId);
        delete socket.data.roomId;
        delete socket.data.playerId;
        emitPublicRooms();
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:start', (rawRoomId) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const roomId = parseRoomId(rawRoomId);
        const result = rooms.startHand(roomId, playerId);
        if (!result.ok) {
          socket.emit('room:error', result.error ?? 'Unable to start hand');
        }
        emitPublicRooms();
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:reset', (rawRoomId) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const roomId = parseRoomId(rawRoomId);
        const result = rooms.resetRoom(roomId, playerId);
        if (!result.ok) {
          socket.emit('room:error', result.error ?? 'Unable to reset room');
        }
        emitPublicRooms();
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:kick', (rawPayload) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const parsed = parseKickPayload(rawPayload);
        const result = rooms.kickPlayer(parsed.roomId, playerId, parsed.targetPlayerId);
        if (!result.ok) {
          socket.emit('room:error', result.error ?? 'Unable to kick player');
        }
        emitPublicRooms();
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:update-settings', (rawPayload) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const parsed = parseUpdateSettingsPayload(rawPayload);
        const result = rooms.updateSettings(parsed.roomId, playerId, parsed.settings);
        if (!result.ok) {
          socket.emit('room:error', result.error ?? 'Unable to update settings');
        }
        emitPublicRooms();
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:rebuy', (rawPayload) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      try {
        const parsed = parseRoomActionPayload(rawPayload);
        const result = rooms.rebuy(parsed.roomId, playerId);
        if (!result.ok) socket.emit('room:error', result.error ?? 'Unable to rebuy');
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:sit-out', (rawPayload) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      try {
        const parsed = parseRoomActionPayload(rawPayload);
        const result = rooms.sitOut(parsed.roomId, playerId);
        if (!result.ok) socket.emit('room:error', result.error ?? 'Unable to sit out');
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:sit-in', (rawPayload) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      try {
        const parsed = parseRoomActionPayload(rawPayload);
        const result = rooms.sitIn(parsed.roomId, playerId);
        if (!result.ok) socket.emit('room:error', result.error ?? 'Unable to sit in');
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('room:leave-seat', (rawPayload) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;
      try {
        const parsed = parseRoomActionPayload(rawPayload);
        const result = rooms.leaveSeat(parsed.roomId, playerId);
        if (!result.ok) socket.emit('room:error', result.error ?? 'Unable to leave seat');
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('lobby:get-public-rooms', () => {
      socket.emit('lobby:public-rooms', rooms.listPublicRooms());
    });

    socket.on('game:action', (rawInput) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const parsed = parseGameActionPayload(rawInput);
        const result = rooms.applyAction(parsed.roomId, playerId, parsed.action);
        if (!result.ok) {
          socket.emit('room:error', result.error ?? 'Action rejected');
        }
      } catch (error) {
        socket.emit('room:error', asErrorMessage(error));
      }
    });

    socket.on('disconnect', () => {
      rooms.unbindSocket(socket.id);
      emitPublicRooms();
    });
  });
}
