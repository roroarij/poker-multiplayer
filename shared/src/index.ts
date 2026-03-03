export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'T'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type TableStatus = 'waiting' | 'in_hand' | 'showdown';

export type PlayerStatus = 'active' | 'folded' | 'all_in' | 'sitting_out' | 'disconnected' | 'busted';

export interface BlindLevel {
  sb: number;
  bb: number;
}

export interface TableSettings {
  roomName: string;
  visibility: 'public' | 'unlisted';
  maxSeats: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  minPlayersToStart: number;
  turnTimeoutSeconds: number;
  allowRebuy: boolean;
  rebuyStack: number;
  rebuyWindowSeconds: number;
  maxRebuysPerPlayer: number | null;
  blindLevelsEnabled: boolean;
  blindLevelDurationSeconds: number;
  blindSchedule: BlindLevel[];
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  seatIndex: number;
  chips: number;
  committedThisRound: number;
  committedThisHand: number;
  status: PlayerStatus;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  isHost: boolean;
  isConnected: boolean;
  color: string;
  rebuysUsed: number;
  rebuyAvailableUntil: number | null;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface ShowdownResult {
  playerId: string;
  rankCategory: number;
  rankLabel: string;
  bestFive: Card[];
  payout: number;
}

export interface PublicGameState {
  roomId: string;
  roomName: string;
  tableStatus: TableStatus;
  street: Street;
  handNumber: number;
  players: PlayerSnapshot[];
  communityCards: Card[];
  pots: Pot[];
  totalPot: number;
  deckCount: number;
  currentTurnPlayerId: string | null;
  currentBet: number;
  minRaiseTo: number;
  actingOrder: string[];
  hostPlayerId: string;
  minPlayersToStart: number;
  blindSmall: number;
  blindBig: number;
  turnEndsAt: number | null;
  lastActionText: string | null;
  settings: TableSettings;
  blindLevelIndex: number;
  nextLevelAt: number | null;
  logEvents: LogEvent[];
  winners?: ShowdownResult[];
}

export interface PlayerPrivateState {
  holeCards: Card[];
  canAct: boolean;
  legalActions: LegalAction[];
  amountToCall: number;
  minRaiseTo: number;
  maxBet: number;
  sessionToken: string;
}

export interface PublicRoomSummary {
  roomId: string;
  roomName: string;
  smallBlind: number;
  bigBlind: number;
  playersSeated: number;
  maxSeats: number;
  status: 'waiting' | 'in_hand';
  createdAt: number;
}

export type LegalActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

export interface LegalAction {
  type: LegalActionType;
  minAmount?: number;
  maxAmount?: number;
}

export interface ClientView {
  game: PublicGameState;
  me: PlayerPrivateState | null;
}

export interface RoomConfig {
  minPlayersToStart: number;
  turnTimeoutSeconds: number;
  smallBlind: number;
  bigBlind: number;
}

export interface CreateRoomInput {
  nickname: string;
  settings?: Partial<TableSettings>;
}

export interface JoinRoomInput {
  roomId: string;
  nickname: string;
  sessionToken?: string;
}

export interface GameActionInput {
  roomId: string;
  action: GameAction;
}

export type GameAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'all_in' };

export type LogEvent =
  | { type: 'PLAYER_ACTION'; playerName: string; action: string; amount?: number }
  | { type: 'STREET'; street: 'FLOP' | 'TURN' | 'RIVER'; cards: Card[]; board: Card[] }
  | { type: 'SHOWDOWN'; winners: { playerName: string; amount: number; handName: string; holeCards?: Card[] }[]; board: Card[] }
  | { type: 'POT'; message: string; amount?: number };

export interface ServerToClientEvents {
  'room:state': (view: ClientView) => void;
  'room:error': (message: string) => void;
  'room:joined': (payload: { roomId: string; playerId: string; sessionToken: string }) => void;
  'room:blind-level-changed': (payload: { roomId: string; levelIndex: number; sb: number; bb: number; nextLevelAt: number | null }) => void;
  'lobby:public-rooms': (rooms: PublicRoomSummary[]) => void;
}

export interface ClientToServerEvents {
  'room:create': (input: CreateRoomInput, cb: (result: { ok: true; roomId: string } | { ok: false; error: string }) => void) => void;
  'room:join': (input: JoinRoomInput, cb: (result: { ok: true; roomId: string } | { ok: false; error: string }) => void) => void;
  'room:leave': (roomId: string) => void;
  'room:start': (roomId: string) => void;
  'room:reset': (roomId: string) => void;
  'room:kick': (payload: { roomId: string; targetPlayerId: string }) => void;
  'room:update-settings': (payload: { roomId: string; settings: Partial<TableSettings> }) => void;
  'room:rebuy': (payload: { roomId: string }) => void;
  'room:sit-out': (payload: { roomId: string }) => void;
  'room:sit-in': (payload: { roomId: string }) => void;
  'room:leave-seat': (payload: { roomId: string }) => void;
  'lobby:get-public-rooms': () => void;
  'game:action': (input: GameActionInput) => void;
}
