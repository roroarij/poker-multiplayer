import type { ClientView, PublicGameState, RoomConfig } from '@poker/shared';
import { applyAction, canStartHand, createInitialState, forceFoldCurrentPlayer, getLegalActions, removePlayer, resetTable, setPlayerConnection, startHand, addPlayer } from '../engine/gameEngine.js';
import type { ApplyActionInput, EngineConfig, EnginePlayer, EngineState } from '../engine/types.js';
import { createRoomId, createToken } from '../utils/id.js';

interface RoomRuntime {
  id: string;
  state: EngineState;
  socketByPlayerId: Map<string, string>;
  playerBySessionToken: Map<string, string>;
  timers: {
    turn: NodeJS.Timeout | null;
    autoStart: NodeJS.Timeout | null;
    nextHand: NodeJS.Timeout | null;
  };
}

interface JoinResult {
  ok: boolean;
  error?: string;
  roomId?: string;
  playerId?: string;
  sessionToken?: string;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly socketIndex = new Map<string, { roomId: string; playerId: string }>();

  constructor(
    private readonly defaults: EngineConfig,
    private readonly onStateChange: (roomId: string) => void,
  ) {}

  createRoom(nickname: string, partialConfig: Partial<RoomConfig> = {}): JoinResult {
    let roomId = createRoomId();
    while (this.rooms.has(roomId)) {
      roomId = createRoomId();
    }

    const config = this.buildConfig(partialConfig);
    const room: RoomRuntime = {
      id: roomId,
      state: createInitialState(roomId, config),
      socketByPlayerId: new Map(),
      playerBySessionToken: new Map(),
      timers: {
        turn: null,
        autoStart: null,
        nextHand: null,
      },
    };

    this.rooms.set(roomId, room);
    return this.joinRoom(roomId, nickname);
  }

  joinRoom(roomId: string, nickname: string, sessionToken?: string): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, error: 'Room not found' };
    }

    if (sessionToken) {
      const playerId = room.playerBySessionToken.get(sessionToken);
      if (playerId) {
        const player = room.state.players.find((existing) => existing.id === playerId);
        if (player) {
          if (nickname.trim()) {
            player.nickname = nickname.trim().slice(0, 20);
          }
          room.state = setPlayerConnection(room.state, player.id, true);
          this.afterStateMutation(room);
          return { ok: true, roomId, playerId: player.id, sessionToken };
        }
      }
    }

    const safeNickname = nickname.trim().slice(0, 20);
    if (!safeNickname) {
      return { ok: false, error: 'Nickname is required' };
    }

    const playerId = createToken(10);
    const token = createToken(30);
    room.state = addPlayer(room.state, {
      id: playerId,
      nickname: safeNickname,
      sessionToken: token,
    });
    room.playerBySessionToken.set(token, playerId);

    this.afterStateMutation(room);
    return { ok: true, roomId, playerId, sessionToken: token };
  }

  bindSocket(roomId: string, playerId: string, socketId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.socketByPlayerId.set(playerId, socketId);
    this.socketIndex.set(socketId, { roomId, playerId });
    room.state = setPlayerConnection(room.state, playerId, true);
    this.afterStateMutation(room);
  }

  unbindSocket(socketId: string): void {
    const index = this.socketIndex.get(socketId);
    if (!index) return;
    this.socketIndex.delete(socketId);

    const room = this.rooms.get(index.roomId);
    if (!room) return;

    const activeSocket = room.socketByPlayerId.get(index.playerId);
    if (activeSocket === socketId) {
      room.socketByPlayerId.delete(index.playerId);
      room.state = setPlayerConnection(room.state, index.playerId, false);
      this.afterStateMutation(room);
    }
  }

  leaveRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const socketId = room.socketByPlayerId.get(playerId);
    if (socketId) {
      room.socketByPlayerId.delete(playerId);
      this.socketIndex.delete(socketId);
    }

    room.state = removePlayer(room.state, playerId);

    for (const [token, id] of room.playerBySessionToken.entries()) {
      if (id === playerId) {
        room.playerBySessionToken.delete(token);
      }
    }

    if (room.state.players.length === 0) {
      this.clearRoomTimers(room);
      this.rooms.delete(roomId);
      return;
    }

    this.afterStateMutation(room);
  }

  startHand(roomId: string, requesterId: string): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const requester = room.state.players.find((player) => player.id === requesterId);
    if (!requester || !requester.isHost) {
      return { ok: false, error: 'Only host can start the game' };
    }

    const result = startHand(room.state);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    room.state = result.state;
    this.afterStateMutation(room);
    return { ok: true };
  }

  resetRoom(roomId: string, requesterId: string): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const requester = room.state.players.find((player) => player.id === requesterId);
    if (!requester || !requester.isHost) {
      return { ok: false, error: 'Only host can reset' };
    }

    room.state = resetTable(room.state);
    this.afterStateMutation(room);
    return { ok: true };
  }

  kickPlayer(roomId: string, requesterId: string, targetPlayerId: string): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const requester = room.state.players.find((player) => player.id === requesterId);
    if (!requester?.isHost) return { ok: false, error: 'Only host can remove players' };
    if (requesterId === targetPlayerId) return { ok: false, error: 'Host cannot remove self' };

    this.leaveRoom(roomId, targetPlayerId);
    return { ok: true };
  }

  applyAction(roomId: string, playerId: string, action: ApplyActionInput): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const result = applyAction(room.state, playerId, action);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    room.state = result.state;
    this.afterStateMutation(room);
    return { ok: true };
  }

  getRoom(roomId: string): RoomRuntime | undefined {
    return this.rooms.get(roomId);
  }

  playerFromSocket(socketId: string): { roomId: string; playerId: string } | null {
    return this.socketIndex.get(socketId) ?? null;
  }

  getSocketId(roomId: string, playerId: string): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.socketByPlayerId.get(playerId) ?? null;
  }

  buildView(roomId: string, viewerPlayerId: string | null): ClientView | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const state = room.state;
    const publicState: PublicGameState = {
      roomId: state.roomId,
      tableStatus: state.tableStatus,
      street: state.street,
      handNumber: state.handNumber,
      players: state.players
        .map((player) => this.toPlayerSnapshot(state, player))
        .sort((a, b) => a.seatIndex - b.seatIndex),
      communityCards: [...state.communityCards],
      pots: state.pots.map((pot) => ({ ...pot, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
      totalPot: state.totalPot,
      deckCount: state.deck.length,
      currentTurnPlayerId: state.currentTurnPlayerId,
      currentBet: state.currentBet,
      minRaiseTo: state.minRaiseTo,
      actingOrder: [...state.actingOrder],
      hostPlayerId: state.players.find((player) => player.isHost)?.id ?? '',
      minPlayersToStart: state.config.minPlayersToStart,
      blindSmall: state.config.smallBlind,
      blindBig: state.config.bigBlind,
      turnEndsAt: state.turnEndsAt,
      lastActionText: state.lastActionText,
      winners: state.winners,
    };

    if (!viewerPlayerId) {
      return { game: publicState, me: null };
    }

    const me = state.players.find((player) => player.id === viewerPlayerId);
    if (!me) {
      return { game: publicState, me: null };
    }

    const legal = getLegalActions(state, me.id);

    return {
      game: publicState,
      me: {
        holeCards: [...me.holeCards],
        canAct: state.currentTurnPlayerId === me.id,
        legalActions: legal.legalActions,
        amountToCall: legal.amountToCall,
        minRaiseTo: legal.minRaiseTo,
        maxBet: legal.maxBet,
        sessionToken: me.sessionToken,
      },
    };
  }

  private toPlayerSnapshot(state: EngineState, player: EnginePlayer) {
    return {
      id: player.id,
      nickname: player.nickname,
      seatIndex: player.seatIndex,
      chips: player.chips,
      committedThisRound: player.committedThisRound,
      committedThisHand: player.committedThisHand,
      status: player.status,
      isDealer: player.seatIndex === state.dealerIndex,
      isSmallBlind: player.seatIndex === state.smallBlindIndex,
      isBigBlind: player.seatIndex === state.bigBlindIndex,
      isTurn: state.currentTurnPlayerId === player.id,
      isHost: player.isHost,
      isConnected: player.isConnected,
      color: player.color,
    };
  }

  private buildConfig(partialConfig: Partial<RoomConfig>): EngineConfig {
    const smallBlind = Math.max(1, Math.floor(partialConfig.smallBlind ?? this.defaults.smallBlind));
    const bigBlind = Math.max(smallBlind + 1, Math.floor(partialConfig.bigBlind ?? this.defaults.bigBlind));

    return {
      minPlayersToStart: Math.max(2, Math.floor(partialConfig.minPlayersToStart ?? this.defaults.minPlayersToStart)),
      turnTimeoutSeconds: Math.max(10, Math.floor(partialConfig.turnTimeoutSeconds ?? this.defaults.turnTimeoutSeconds)),
      smallBlind,
      bigBlind,
    };
  }

  private afterStateMutation(room: RoomRuntime): void {
    this.reconcileTimers(room);
    this.onStateChange(room.id);
  }

  private reconcileTimers(room: RoomRuntime): void {
    if (room.timers.turn) {
      clearTimeout(room.timers.turn);
      room.timers.turn = null;
    }

    if (room.state.tableStatus === 'in_hand' && room.state.currentTurnPlayerId) {
      const timeoutMs = room.state.config.turnTimeoutSeconds * 1000;
      room.state.turnEndsAt = Date.now() + timeoutMs;
      room.timers.turn = setTimeout(() => {
        room.state = forceFoldCurrentPlayer(room.state);
        this.afterStateMutation(room);
      }, timeoutMs);
    } else {
      room.state.turnEndsAt = null;
    }

    if (room.timers.autoStart) {
      clearTimeout(room.timers.autoStart);
      room.timers.autoStart = null;
    }

    if (room.timers.nextHand) {
      clearTimeout(room.timers.nextHand);
      room.timers.nextHand = null;
    }

    if (room.state.tableStatus === 'waiting' && canStartHand(room.state)) {
      room.timers.autoStart = setTimeout(() => {
        const started = startHand(room.state);
        if (started.ok) {
          room.state = started.state;
          this.afterStateMutation(room);
        }
      }, 1200);
    }

    if (room.state.tableStatus === 'showdown' && canStartHand(room.state)) {
      room.timers.nextHand = setTimeout(() => {
        const started = startHand(room.state);
        if (started.ok) {
          room.state = started.state;
          this.afterStateMutation(room);
        }
      }, 4500);
    }
  }

  private clearRoomTimers(room: RoomRuntime): void {
    if (room.timers.turn) clearTimeout(room.timers.turn);
    if (room.timers.autoStart) clearTimeout(room.timers.autoStart);
    if (room.timers.nextHand) clearTimeout(room.timers.nextHand);
  }
}
