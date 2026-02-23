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

export type PlayerStatus = 'active' | 'folded' | 'all_in' | 'sitting_out' | 'disconnected';

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
  config?: Partial<RoomConfig>;
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

export interface ServerToClientEvents {
  'room:state': (view: ClientView) => void;
  'room:error': (message: string) => void;
  'room:joined': (payload: { roomId: string; playerId: string; sessionToken: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (input: CreateRoomInput, cb: (result: { ok: true; roomId: string } | { ok: false; error: string }) => void) => void;
  'room:join': (input: JoinRoomInput, cb: (result: { ok: true; roomId: string } | { ok: false; error: string }) => void) => void;
  'room:leave': (roomId: string) => void;
  'room:start': (roomId: string) => void;
  'room:reset': (roomId: string) => void;
  'room:kick': (payload: { roomId: string; targetPlayerId: string }) => void;
  'game:action': (input: GameActionInput) => void;
}
