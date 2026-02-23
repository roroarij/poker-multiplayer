import type { Card, PlayerStatus, Pot, Street, TableStatus } from '@poker/shared';

export interface EnginePlayer {
  id: string;
  nickname: string;
  seatIndex: number;
  chips: number;
  committedThisRound: number;
  committedThisHand: number;
  status: PlayerStatus;
  holeCards: Card[];
  hasActedThisRound: boolean;
  isConnected: boolean;
  isHost: boolean;
  color: string;
  sessionToken: string;
}

export interface EngineConfig {
  minPlayersToStart: number;
  turnTimeoutSeconds: number;
  smallBlind: number;
  bigBlind: number;
}

export interface ShowdownRecord {
  playerId: string;
  rankCategory: number;
  rankLabel: string;
  bestFive: Card[];
  payout: number;
}

export interface EngineState {
  roomId: string;
  handNumber: number;
  tableStatus: TableStatus;
  street: Street;
  players: EnginePlayer[];
  communityCards: Card[];
  deck: Card[];
  dealerIndex: number;
  smallBlindIndex: number | null;
  bigBlindIndex: number | null;
  currentTurnPlayerId: string | null;
  currentBet: number;
  minRaiseTo: number;
  minRaiseIncrement: number;
  lastAggressorId: string | null;
  actingOrder: string[];
  pots: Pot[];
  totalPot: number;
  lastActionText: string | null;
  winners: ShowdownRecord[];
  turnEndsAt: number | null;
  config: EngineConfig;
}

export type ApplyActionInput =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'all_in' };

export interface EngineResult {
  ok: boolean;
  error?: string;
  state: EngineState;
}
