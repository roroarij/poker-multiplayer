import type { Card, LogEvent } from '@poker/shared';
import type { EnginePlayer, EngineState } from '../engine/types.js';

function parseAmount(text: string): number | undefined {
  const match = text.match(/(\d+)/g);
  if (!match?.length) return undefined;
  return Number(match[match.length - 1]);
}

export function playerActionEvent(lastActionText: string): LogEvent {
  const trimmed = lastActionText.trim();
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace < 0) {
    return { type: 'POT', message: trimmed };
  }

  const playerName = trimmed.slice(0, firstSpace);
  const action = trimmed.slice(firstSpace + 1);

  return {
    type: 'PLAYER_ACTION',
    playerName,
    action,
    amount: parseAmount(action),
  };
}

function communityDelta(prev: Card[], next: Card[]): Card[] {
  if (next.length <= prev.length) return [];
  return next.slice(prev.length);
}

export function streetTransitionEvent(prev: EngineState, next: EngineState): LogEvent | null {
  if (prev.street === next.street) return null;

  if (next.street === 'flop') {
    return {
      type: 'STREET',
      street: 'FLOP',
      cards: communityDelta(prev.communityCards, next.communityCards),
      board: [...next.communityCards],
    };
  }
  if (next.street === 'turn') {
    return {
      type: 'STREET',
      street: 'TURN',
      cards: communityDelta(prev.communityCards, next.communityCards),
      board: [...next.communityCards],
    };
  }
  if (next.street === 'river') {
    return {
      type: 'STREET',
      street: 'RIVER',
      cards: communityDelta(prev.communityCards, next.communityCards),
      board: [...next.communityCards],
    };
  }

  return null;
}

export function showdownEvent(state: EngineState): LogEvent | null {
  if (!state.winners.length) return null;

  const winners = state.winners.map((winner) => {
    const player = state.players.find((entry) => entry.id === winner.playerId);
    return {
      playerName: player?.nickname ?? winner.playerId,
      amount: winner.payout,
      handName: winner.rankLabel,
      holeCards: player?.holeCards?.length === 2 ? [...player.holeCards] : undefined,
    };
  });

  return {
    type: 'SHOWDOWN',
    winners,
    board: [...state.communityCards],
  };
}

export function bustedMessage(player: EnginePlayer, until: number): LogEvent {
  return {
    type: 'POT',
    message: `${player.nickname} busted. Rebuy available for ${Math.max(0, Math.ceil((until - Date.now()) / 1000))}s`,
  };
}
