import type { ClientView, LogEvent, PublicGameState, PublicRoomSummary, TableSettings } from '@poker/shared';
import {
  addPlayer,
  applyAction,
  canStartHand,
  createInitialState,
  forceFoldCurrentPlayer,
  getLegalActions,
  removePlayer,
  resetTable,
  setPlayerConnection,
  startHand,
} from '../engine/gameEngine.js';
import type { ApplyActionInput, EngineConfig, EnginePlayer, EngineState } from '../engine/types.js';
import { toPublicRoomSummary } from '../lobby/publicLobby.js';
import { createDefaultTableSettings, mergeTableSettings } from '../settings/tableSettings.js';
import { advanceBlindLevel, beginBlindLevels, currentBlindPair, initialBlindLevelState, type BlindLevelState } from '../timers/blindLevels.js';
import { bustedMessage, playerActionEvent, showdownEvent, streetTransitionEvent } from '../view/logEvents.js';
import { createRoomId, createToken } from '../utils/id.js';

interface RoomRuntime {
  id: string;
  createdAt: number;
  settings: TableSettings;
  state: EngineState;
  socketByPlayerId: Map<string, string>;
  playerBySessionToken: Map<string, string>;
  rebuysUsed: Map<string, number>;
  rebuyAvailableUntilByPlayerId: Map<string, number>;
  blindLevels: BlindLevelState;
  pendingBlindChange: { smallBlind: number; bigBlind: number } | null;
  logEvents: LogEvent[];
  timers: {
    turn: NodeJS.Timeout | null;
    autoStart: NodeJS.Timeout | null;
    nextHand: NodeJS.Timeout | null;
    blindLevel: NodeJS.Timeout | null;
  };
}

interface JoinResult {
  ok: boolean;
  error?: string;
  roomId?: string;
  playerId?: string;
  sessionToken?: string;
}

interface Result {
  ok: boolean;
  error?: string;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly socketIndex = new Map<string, { roomId: string; playerId: string }>();

  constructor(
    private readonly defaults: EngineConfig,
    private readonly onStateChange: (roomId: string) => void,
    private readonly onBlindLevelChange: (payload: { roomId: string; levelIndex: number; sb: number; bb: number; nextLevelAt: number | null }) => void,
  ) {}

  createRoom(nickname: string, settingsPatch: Partial<TableSettings> = {}): JoinResult {
    let roomId = createRoomId();
    while (this.rooms.has(roomId)) {
      roomId = createRoomId();
    }

    const settings = createDefaultTableSettings(settingsPatch);
    const engineConfig = this.toEngineConfig(settings);

    const room: RoomRuntime = {
      id: roomId,
      createdAt: Date.now(),
      settings,
      state: createInitialState(roomId, engineConfig),
      socketByPlayerId: new Map(),
      playerBySessionToken: new Map(),
      rebuysUsed: new Map(),
      rebuyAvailableUntilByPlayerId: new Map(),
      blindLevels: initialBlindLevelState(),
      pendingBlindChange: null,
      logEvents: [],
      timers: {
        turn: null,
        autoStart: null,
        nextHand: null,
        blindLevel: null,
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

    if (room.state.players.length >= room.settings.maxSeats) {
      return { ok: false, error: 'Room is full' };
    }

    const safeNickname = nickname.trim().slice(0, 20);
    if (!safeNickname) {
      return { ok: false, error: 'Nickname is required' };
    }

    const playerId = createToken(10);
    const token = createToken(30);
    room.state = addPlayer(
      room.state,
      {
        id: playerId,
        nickname: safeNickname,
        sessionToken: token,
      },
      room.settings.startingStack,
    );
    room.playerBySessionToken.set(token, playerId);
    room.rebuysUsed.set(playerId, 0);

    this.appendLog(room, { type: 'POT', message: `${safeNickname} joined the table` });
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

    const leavingPlayer = room.state.players.find((player) => player.id === playerId);
    if (leavingPlayer) {
      this.appendLog(room, { type: 'POT', message: `${leavingPlayer.nickname} left the table` });
    }

    room.state = removePlayer(room.state, playerId);
    room.rebuyAvailableUntilByPlayerId.delete(playerId);
    room.rebuysUsed.delete(playerId);

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

  leaveSeat(roomId: string, playerId: string): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const player = room.state.players.find((entry) => entry.id === playerId);
    if (!player) return { ok: false, error: 'Player not found' };

    player.status = 'sitting_out';
    player.holeCards = [];
    this.appendLog(room, { type: 'POT', message: `${player.nickname} left their seat` });
    this.afterStateMutation(room);
    return { ok: true };
  }

  sitOut(roomId: string, playerId: string): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const player = room.state.players.find((entry) => entry.id === playerId);
    if (!player) return { ok: false, error: 'Player not found' };

    player.status = 'sitting_out';
    player.holeCards = [];
    this.appendLog(room, { type: 'POT', message: `${player.nickname} is sitting out` });
    this.afterStateMutation(room);
    return { ok: true };
  }

  sitIn(roomId: string, playerId: string): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const player = room.state.players.find((entry) => entry.id === playerId);
    if (!player) return { ok: false, error: 'Player not found' };

    if (player.chips <= 0) {
      if (room.settings.allowRebuy) {
        const rebuyResult = this.rebuy(roomId, playerId);
        if (!rebuyResult.ok) return rebuyResult;
      } else {
        return { ok: false, error: 'No chips available. Rebuy required' };
      }
    }

    player.status = 'active';
    this.appendLog(room, { type: 'POT', message: `${player.nickname} sat back in` });
    this.afterStateMutation(room);
    return { ok: true };
  }

  rebuy(roomId: string, playerId: string): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };
    if (!room.settings.allowRebuy) return { ok: false, error: 'Rebuys disabled for this table' };

    const player = room.state.players.find((entry) => entry.id === playerId);
    if (!player) return { ok: false, error: 'Player not found' };

    const used = room.rebuysUsed.get(playerId) ?? 0;
    if (room.settings.maxRebuysPerPlayer !== null && used >= room.settings.maxRebuysPerPlayer) {
      return { ok: false, error: 'Rebuy limit reached' };
    }

    player.chips = room.settings.rebuyStack;
    player.status = 'active';
    room.rebuysUsed.set(playerId, used + 1);
    room.rebuyAvailableUntilByPlayerId.delete(playerId);

    this.appendLog(room, { type: 'POT', message: `${player.nickname} rebuys for ${room.settings.rebuyStack}`, amount: room.settings.rebuyStack });
    this.afterStateMutation(room);
    return { ok: true };
  }

  updateSettings(roomId: string, requesterId: string, patch: Partial<TableSettings>): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const requester = room.state.players.find((player) => player.id === requesterId);
    if (!requester?.isHost) return { ok: false, error: 'Only host can update settings' };

    room.settings = mergeTableSettings(room.settings, patch);
    room.state.config.minPlayersToStart = room.settings.minPlayersToStart;
    room.state.config.turnTimeoutSeconds = room.settings.turnTimeoutSeconds;

    const blindChanged = patch.smallBlind !== undefined || patch.bigBlind !== undefined;
    if (blindChanged) {
      if (room.state.tableStatus === 'in_hand') {
        room.pendingBlindChange = {
          smallBlind: room.settings.smallBlind,
          bigBlind: room.settings.bigBlind,
        };
        this.appendLog(room, { type: 'POT', message: `Blinds will change next hand to ${room.settings.smallBlind}/${room.settings.bigBlind}` });
      } else {
        room.state.config.smallBlind = room.settings.smallBlind;
        room.state.config.bigBlind = room.settings.bigBlind;
      }
    }

    if (patch.blindLevelsEnabled !== undefined || patch.blindLevelDurationSeconds !== undefined || patch.blindSchedule !== undefined) {
      this.scheduleBlindLevelTimer(room);
    }

    this.afterStateMutation(room);
    return { ok: true };
  }

  startHand(roomId: string, requesterId: string): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const requester = room.state.players.find((player) => player.id === requesterId);
    if (!requester || !requester.isHost) {
      return { ok: false, error: 'Only host can start the game' };
    }

    const started = this.startHandInternal(room);
    if (!started.ok) return started;
    this.afterStateMutation(room);
    return { ok: true };
  }

  resetRoom(roomId: string, requesterId: string): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const requester = room.state.players.find((player) => player.id === requesterId);
    if (!requester || !requester.isHost) {
      return { ok: false, error: 'Only host can reset' };
    }

    room.state = resetTable(room.state);
    room.blindLevels = initialBlindLevelState();
    room.pendingBlindChange = null;
    room.state.config.smallBlind = room.settings.smallBlind;
    room.state.config.bigBlind = room.settings.bigBlind;
    this.appendLog(room, { type: 'POT', message: 'Table reset' });
    this.scheduleBlindLevelTimer(room);
    this.afterStateMutation(room);
    return { ok: true };
  }

  kickPlayer(roomId: string, requesterId: string, targetPlayerId: string): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const requester = room.state.players.find((player) => player.id === requesterId);
    if (!requester?.isHost) return { ok: false, error: 'Only host can remove players' };
    if (requesterId === targetPlayerId) return { ok: false, error: 'Host cannot remove self' };

    this.leaveRoom(roomId, targetPlayerId);
    return { ok: true };
  }

  applyAction(roomId: string, playerId: string, action: ApplyActionInput): Result {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found' };

    const prevState = room.state;
    const result = applyAction(room.state, playerId, action);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    room.state = result.state;

    if (room.state.lastActionText && room.state.lastActionText !== prevState.lastActionText) {
      this.appendLog(room, playerActionEvent(room.state.lastActionText));
    }

    const streetEvent = streetTransitionEvent(prevState, room.state);
    if (streetEvent) {
      this.appendLog(room, streetEvent);
    }

    if (prevState.tableStatus !== 'showdown' && room.state.tableStatus === 'showdown') {
      const event = showdownEvent(room.state);
      if (event) {
        this.appendLog(room, event);
      }
    }

    this.afterStateMutation(room);
    return { ok: true };
  }

  getRoom(roomId: string): RoomRuntime | undefined {
    return this.rooms.get(roomId);
  }

  listPublicRooms(): PublicRoomSummary[] {
    return [...this.rooms.values()]
      .filter((room) => room.settings.visibility === 'public')
      .map((room) => toPublicRoomSummary(room.id, room.createdAt, room.settings, room.state))
      .sort((a, b) => b.createdAt - a.createdAt);
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
      roomName: room.settings.roomName,
      tableStatus: state.tableStatus,
      street: state.street,
      handNumber: state.handNumber,
      players: state.players
        .map((player) => this.toPlayerSnapshot(room, state, player))
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
      settings: room.settings,
      blindLevelIndex: room.blindLevels.levelIndex,
      nextLevelAt: room.blindLevels.nextLevelAt,
      logEvents: [...room.logEvents],
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

  private toPlayerSnapshot(room: RoomRuntime, state: EngineState, player: EnginePlayer) {
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
      rebuysUsed: room.rebuysUsed.get(player.id) ?? 0,
      rebuyAvailableUntil: room.rebuyAvailableUntilByPlayerId.get(player.id) ?? null,
    };
  }

  private toEngineConfig(settings: TableSettings): EngineConfig {
    return {
      minPlayersToStart: settings.minPlayersToStart,
      turnTimeoutSeconds: settings.turnTimeoutSeconds,
      smallBlind: settings.smallBlind,
      bigBlind: settings.bigBlind,
    };
  }

  private appendLog(room: RoomRuntime, event: LogEvent): void {
    room.logEvents = [event, ...room.logEvents].slice(0, 80);
  }

  private startHandInternal(room: RoomRuntime): Result {
    if (room.pendingBlindChange) {
      room.state.config.smallBlind = room.pendingBlindChange.smallBlind;
      room.state.config.bigBlind = room.pendingBlindChange.bigBlind;
      room.pendingBlindChange = null;
    }

    if (room.settings.blindLevelsEnabled) {
      const levelBlinds = currentBlindPair(room.blindLevels, room.settings);
      room.state.config.smallBlind = levelBlinds.sb;
      room.state.config.bigBlind = levelBlinds.bb;
    }

    const result = startHand(room.state);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const wasFirstHand = room.state.handNumber === 0;
    room.state = result.state;
    this.appendLog(room, { type: 'POT', message: `Hand ${room.state.handNumber} started (${room.state.config.smallBlind}/${room.state.config.bigBlind})` });

    if (wasFirstHand && room.state.handNumber === 1) {
      room.blindLevels = beginBlindLevels(room.blindLevels, room.settings);
      this.scheduleBlindLevelTimer(room);
    }

    return { ok: true };
  }

  private applyBustAndRebuyTransitions(room: RoomRuntime): void {
    if (room.state.tableStatus !== 'showdown') return;

    for (const player of room.state.players) {
      if (player.chips > 0) {
        room.rebuyAvailableUntilByPlayerId.delete(player.id);
        if (player.status === 'busted') {
          player.status = player.isConnected ? 'active' : 'disconnected';
        }
        continue;
      }

      if (!room.settings.allowRebuy) {
        player.status = 'sitting_out';
        continue;
      }

      const now = Date.now();
      const existing = room.rebuyAvailableUntilByPlayerId.get(player.id);
      const expiresAt = existing ?? now + room.settings.rebuyWindowSeconds * 1000;
      room.rebuyAvailableUntilByPlayerId.set(player.id, expiresAt);
      player.status = 'busted';

      if (!existing) {
        this.appendLog(room, bustedMessage(player, expiresAt));
      }

      if (now >= expiresAt) {
        player.status = 'sitting_out';
      }
    }

    for (const [playerId, expiresAt] of room.rebuyAvailableUntilByPlayerId.entries()) {
      if (Date.now() < expiresAt) continue;
      const player = room.state.players.find((entry) => entry.id === playerId);
      if (!player || player.chips > 0) {
        room.rebuyAvailableUntilByPlayerId.delete(playerId);
        continue;
      }
      player.status = 'sitting_out';
      room.rebuyAvailableUntilByPlayerId.delete(playerId);
      this.appendLog(room, { type: 'POT', message: `${player.nickname} rebuy window expired and is now sitting out` });
    }
  }

  private afterStateMutation(room: RoomRuntime): void {
    this.applyBustAndRebuyTransitions(room);
    this.reconcileTimers(room);
    this.onStateChange(room.id);
  }

  private scheduleBlindLevelTimer(room: RoomRuntime): void {
    if (room.timers.blindLevel) {
      clearTimeout(room.timers.blindLevel);
      room.timers.blindLevel = null;
    }

    if (!room.settings.blindLevelsEnabled || room.blindLevels.nextLevelAt === null) {
      room.blindLevels.nextLevelAt = null;
      return;
    }

    const delay = Math.max(0, room.blindLevels.nextLevelAt - Date.now());
    room.timers.blindLevel = setTimeout(() => {
      room.blindLevels = advanceBlindLevel(room.blindLevels, room.settings);
      const blinds = currentBlindPair(room.blindLevels, room.settings);
      room.pendingBlindChange = { smallBlind: blinds.sb, bigBlind: blinds.bb };

      this.appendLog(room, { type: 'POT', message: `Blind level changed. Next hand: ${blinds.sb}/${blinds.bb}` });

      this.onBlindLevelChange({
        roomId: room.id,
        levelIndex: room.blindLevels.levelIndex,
        sb: blinds.sb,
        bb: blinds.bb,
        nextLevelAt: room.blindLevels.nextLevelAt,
      });

      this.scheduleBlindLevelTimer(room);
      this.onStateChange(room.id);
    }, delay);
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
        if (room.state.lastActionText) {
          this.appendLog(room, playerActionEvent(room.state.lastActionText));
        }
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
        const started = this.startHandInternal(room);
        if (started.ok) {
          this.afterStateMutation(room);
        }
      }, 1200);
    }

    if (room.state.tableStatus === 'showdown' && canStartHand(room.state)) {
      room.timers.nextHand = setTimeout(() => {
        const started = this.startHandInternal(room);
        if (started.ok) {
          this.afterStateMutation(room);
        }
      }, 4500);
    }
  }

  private clearRoomTimers(room: RoomRuntime): void {
    if (room.timers.turn) clearTimeout(room.timers.turn);
    if (room.timers.autoStart) clearTimeout(room.timers.autoStart);
    if (room.timers.nextHand) clearTimeout(room.timers.nextHand);
    if (room.timers.blindLevel) clearTimeout(room.timers.blindLevel);
  }
}
