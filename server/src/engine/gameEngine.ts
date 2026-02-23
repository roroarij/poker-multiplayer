import type { LegalAction, Pot } from '@poker/shared';
import { createDeck, dealCards, shuffleDeck } from './cards.js';
import { compareEvaluatedHands, evaluateBestHand, type EvaluatedHand } from './handEvaluator.js';
import type { ApplyActionInput, EngineConfig, EnginePlayer, EngineResult, EngineState, ShowdownRecord } from './types.js';

const PLAYER_COLORS = ['#f25f5c', '#ffe066', '#247ba0', '#70c1b3', '#50514f', '#c06c84', '#355c7d', '#f6bd60'];

function cloneState(state: EngineState): EngineState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, holeCards: [...p.holeCards] })),
    communityCards: [...state.communityCards],
    deck: [...state.deck],
    actingOrder: [...state.actingOrder],
    pots: state.pots.map((pot) => ({ ...pot, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
    winners: state.winners.map((winner) => ({ ...winner, bestFive: [...winner.bestFive] })),
    config: { ...state.config },
  };
}

function nextSeat(players: EnginePlayer[], fromSeatIndex: number, eligible: (player: EnginePlayer) => boolean): number | null {
  if (players.length === 0) return null;
  const sorted = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const start = sorted.findIndex((player) => player.seatIndex === fromSeatIndex);
  const begin = start >= 0 ? start : 0;

  for (let step = 1; step <= sorted.length; step += 1) {
    const candidate = sorted[(begin + step) % sorted.length];
    if (eligible(candidate)) {
      return candidate.seatIndex;
    }
  }

  return null;
}

function playerBySeat(state: EngineState, seatIndex: number): EnginePlayer | undefined {
  return state.players.find((player) => player.seatIndex === seatIndex);
}

function playerById(state: EngineState, playerId: string): EnginePlayer | undefined {
  return state.players.find((player) => player.id === playerId);
}

function inHandParticipants(state: EngineState): EnginePlayer[] {
  return state.players.filter((player) => player.holeCards.length === 2 && player.status !== 'sitting_out');
}

function activeForHandStart(state: EngineState): EnginePlayer[] {
  return state.players.filter((player) => player.chips > 0 && player.isConnected && player.status !== 'sitting_out');
}

function canTakeAction(player: EnginePlayer): boolean {
  return player.status === 'active' && player.chips > 0;
}

function nonFoldedParticipants(state: EngineState): EnginePlayer[] {
  return inHandParticipants(state).filter((player) => player.status !== 'folded');
}

function updatePots(state: EngineState): void {
  const contributors = state.players.filter((player) => player.committedThisHand > 0);
  const thresholds = [...new Set(contributors.map((player) => player.committedThisHand))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previous = 0;

  for (const threshold of thresholds) {
    const involved = contributors.filter((player) => player.committedThisHand >= threshold);
    const increment = threshold - previous;
    const amount = increment * involved.length;
    if (amount <= 0) continue;

    const eligiblePlayerIds = involved.filter((player) => player.status !== 'folded').map((player) => player.id);
    pots.push({ amount, eligiblePlayerIds });
    previous = threshold;
  }

  state.pots = pots;
  state.totalPot = pots.reduce((sum, pot) => sum + pot.amount, 0);
}

function commitChips(player: EnginePlayer, amount: number): number {
  const applied = Math.max(0, Math.min(amount, player.chips));
  player.chips -= applied;
  player.committedThisRound += applied;
  player.committedThisHand += applied;
  if (player.chips === 0 && player.status === 'active') {
    player.status = 'all_in';
  }
  return applied;
}

function setActingOrder(state: EngineState): void {
  const players = state.players
    .filter((player) => player.holeCards.length === 2 && player.status !== 'folded')
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((player) => player.id);
  state.actingOrder = players;
}

function firstToActPostFlop(state: EngineState): EnginePlayer | undefined {
  const participants = inHandParticipants(state)
    .filter((player) => player.status !== 'folded')
    .sort((a, b) => a.seatIndex - b.seatIndex);
  if (participants.length === 0) return undefined;

  const dealerSeat = playerBySeat(state, state.dealerIndex)?.seatIndex ?? participants[0].seatIndex;
  const seat = nextSeat(participants, dealerSeat, (player) => canTakeAction(player));
  if (seat === null) return undefined;
  return participants.find((player) => player.seatIndex === seat);
}

function firstToActPreflop(state: EngineState): EnginePlayer | undefined {
  if (state.bigBlindIndex === null) return undefined;
  const participants = inHandParticipants(state)
    .filter((player) => player.status !== 'folded')
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const seat = nextSeat(participants, state.bigBlindIndex, (player) => canTakeAction(player));
  if (seat === null) return undefined;
  return participants.find((player) => player.seatIndex === seat);
}

function nextActorAfter(state: EngineState, seatIndex: number): EnginePlayer | undefined {
  const participants = inHandParticipants(state)
    .filter((player) => player.status !== 'folded')
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const seat = nextSeat(participants, seatIndex, (player) => canTakeAction(player));
  if (seat === null) return undefined;
  return participants.find((player) => player.seatIndex === seat);
}

function recomputeTurn(state: EngineState, startingSeat?: number): void {
  const actionPlayers = inHandParticipants(state).filter((player) => canTakeAction(player));
  if (actionPlayers.length === 0) {
    state.currentTurnPlayerId = null;
    return;
  }

  if (startingSeat !== undefined) {
    const candidate = nextActorAfter(state, startingSeat);
    state.currentTurnPlayerId = candidate?.id ?? null;
    return;
  }

  const candidate = actionPlayers.sort((a, b) => a.seatIndex - b.seatIndex)[0];
  state.currentTurnPlayerId = candidate?.id ?? null;
}

function isBettingRoundComplete(state: EngineState): boolean {
  const actors = inHandParticipants(state).filter((player) => player.status === 'active');
  if (actors.length === 0) return true;

  return actors.every(
    (player) =>
      player.hasActedThisRound &&
      player.committedThisRound === state.currentBet,
  );
}

function allRemainingAllIn(state: EngineState): boolean {
  const remaining = nonFoldedParticipants(state);
  if (remaining.length <= 1) return true;
  return remaining.every((player) => player.status === 'all_in');
}

function advanceStreet(state: EngineState): void {
  for (const player of state.players) {
    player.committedThisRound = 0;
    player.hasActedThisRound = false;
  }
  state.currentBet = 0;
  state.minRaiseIncrement = state.config.bigBlind;
  state.minRaiseTo = state.config.bigBlind;
  state.lastAggressorId = null;

  if (state.street === 'preflop') {
    const flop = dealCards(state.deck, 3);
    state.communityCards.push(...flop.dealt);
    state.deck = flop.rest;
    state.street = 'flop';
  } else if (state.street === 'flop') {
    const turn = dealCards(state.deck, 1);
    state.communityCards.push(turn.dealt[0]);
    state.deck = turn.rest;
    state.street = 'turn';
  } else if (state.street === 'turn') {
    const river = dealCards(state.deck, 1);
    state.communityCards.push(river.dealt[0]);
    state.deck = river.rest;
    state.street = 'river';
  } else {
    state.street = 'showdown';
  }

  setActingOrder(state);
  const first = firstToActPostFlop(state);
  state.currentTurnPlayerId = first?.id ?? null;
}

function ensureBoardComplete(state: EngineState): void {
  while (state.communityCards.length < 5) {
    const one = dealCards(state.deck, 1);
    state.communityCards.push(one.dealt[0]);
    state.deck = one.rest;
  }
  state.street = 'showdown';
}

function settleUncontested(state: EngineState): void {
  const contenders = nonFoldedParticipants(state);
  if (contenders.length !== 1) return;

  updatePots(state);
  const winner = contenders[0];
  winner.chips += state.totalPot;

  state.tableStatus = 'showdown';
  state.street = 'showdown';
  state.currentTurnPlayerId = null;
  state.lastActionText = `${winner.nickname} wins ${state.totalPot} chips (uncontested)`;
  state.winners = [
    {
      playerId: winner.id,
      rankCategory: 9,
      rankLabel: 'Uncontested',
      bestFive: [],
      payout: state.totalPot,
    },
  ];
}

function settleShowdown(state: EngineState): void {
  ensureBoardComplete(state);
  updatePots(state);

  const handCache = new Map<string, EvaluatedHand>();
  const winnerMap = new Map<string, ShowdownRecord>();

  for (const player of nonFoldedParticipants(state)) {
    if (player.holeCards.length !== 2) continue;
    handCache.set(player.id, evaluateBestHand([...player.holeCards, ...state.communityCards]));
  }

  const seatOrder = [...state.players].sort((a, b) => a.seatIndex - b.seatIndex).map((player) => player.id);

  for (const pot of state.pots) {
    const eligible = pot.eligiblePlayerIds
      .map((id) => playerById(state, id))
      .filter((player): player is EnginePlayer => Boolean(player && player.status !== 'folded' && handCache.has(player.id)));

    if (eligible.length === 0) continue;

    let best = handCache.get(eligible[0].id)!;
    let potWinners: EnginePlayer[] = [eligible[0]];

    for (const challenger of eligible.slice(1)) {
      const evaluated = handCache.get(challenger.id)!;
      const cmp = compareEvaluatedHands(evaluated, best);
      if (cmp > 0) {
        best = evaluated;
        potWinners = [challenger];
      } else if (cmp === 0) {
        potWinners.push(challenger);
      }
    }

    const base = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount % potWinners.length;
    const orderedWinners = [...potWinners].sort(
      (a, b) => seatOrder.indexOf(a.id) - seatOrder.indexOf(b.id),
    );

    for (const winner of orderedWinners) {
      const payout = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      winner.chips += payout;

      const hand = handCache.get(winner.id)!;
      const existing = winnerMap.get(winner.id);
      if (existing) {
        existing.payout += payout;
      } else {
        winnerMap.set(winner.id, {
          playerId: winner.id,
          rankCategory: hand.category,
          rankLabel: hand.label,
          bestFive: hand.bestFive,
          payout,
        });
      }
    }
  }

  state.tableStatus = 'showdown';
  state.street = 'showdown';
  state.currentTurnPlayerId = null;
  state.winners = [...winnerMap.values()].sort((a, b) => b.payout - a.payout);
  state.lastActionText = state.winners
    .map((winner) => {
      const player = playerById(state, winner.playerId);
      return `${player?.nickname ?? winner.playerId} +${winner.payout} (${winner.rankLabel})`;
    })
    .join(', ');
}

function evaluateHandProgress(state: EngineState): void {
  if (state.tableStatus !== 'in_hand') return;

  const nonFolded = nonFoldedParticipants(state);
  if (nonFolded.length <= 1) {
    settleUncontested(state);
    return;
  }

  if (allRemainingAllIn(state)) {
    settleShowdown(state);
    return;
  }

  if (!isBettingRoundComplete(state)) {
    return;
  }

  if (state.street === 'river') {
    settleShowdown(state);
    return;
  }

  advanceStreet(state);
}

function resetPlayerForNewHand(player: EnginePlayer): void {
  player.committedThisHand = 0;
  player.committedThisRound = 0;
  player.holeCards = [];
  player.hasActedThisRound = false;
  if (!player.isConnected) {
    player.status = 'disconnected';
  } else if (player.chips <= 0) {
    player.status = 'sitting_out';
  } else {
    player.status = 'active';
  }
}

function assignBlinds(state: EngineState, participants: EnginePlayer[]): void {
  const ordered = [...participants].sort((a, b) => a.seatIndex - b.seatIndex);
  if (ordered.length < 2) {
    state.smallBlindIndex = null;
    state.bigBlindIndex = null;
    return;
  }

  const dealerSeat = state.dealerIndex;
  const sbSeat = nextSeat(ordered, dealerSeat, () => true);
  const bbSeat = sbSeat === null ? null : nextSeat(ordered, sbSeat, () => true);
  state.smallBlindIndex = sbSeat;
  state.bigBlindIndex = bbSeat;
}

function rotateDealer(state: EngineState, participants: EnginePlayer[]): void {
  const ordered = [...participants].sort((a, b) => a.seatIndex - b.seatIndex);
  if (ordered.length === 0) {
    state.dealerIndex = -1;
    return;
  }

  if (state.dealerIndex < 0) {
    state.dealerIndex = ordered[0].seatIndex;
    return;
  }

  const next = nextSeat(ordered, state.dealerIndex, () => true);
  state.dealerIndex = next ?? ordered[0].seatIndex;
}

export function createInitialState(roomId: string, config: EngineConfig): EngineState {
  return {
    roomId,
    handNumber: 0,
    tableStatus: 'waiting',
    street: 'preflop',
    players: [],
    communityCards: [],
    deck: [],
    dealerIndex: -1,
    smallBlindIndex: null,
    bigBlindIndex: null,
    currentTurnPlayerId: null,
    currentBet: 0,
    minRaiseTo: config.bigBlind,
    minRaiseIncrement: config.bigBlind,
    lastAggressorId: null,
    actingOrder: [],
    pots: [],
    totalPot: 0,
    lastActionText: null,
    winners: [],
    turnEndsAt: null,
    config: { ...config },
  };
}

export function addPlayer(state: EngineState, player: { id: string; nickname: string; sessionToken: string }): EngineState {
  const next = cloneState(state);
  if (next.players.some((existing) => existing.id === player.id)) {
    return next;
  }

  const takenSeats = new Set(next.players.map((p) => p.seatIndex));
  let seatIndex = 0;
  while (takenSeats.has(seatIndex)) seatIndex += 1;

  next.players.push({
    id: player.id,
    nickname: player.nickname,
    seatIndex,
    chips: 2000,
    committedThisRound: 0,
    committedThisHand: 0,
    status: 'active',
    holeCards: [],
    hasActedThisRound: false,
    isConnected: true,
    isHost: next.players.length === 0,
    color: PLAYER_COLORS[seatIndex % PLAYER_COLORS.length],
    sessionToken: player.sessionToken,
  });

  return next;
}

export function removePlayer(state: EngineState, playerId: string): EngineState {
  const next = cloneState(state);
  const idx = next.players.findIndex((player) => player.id === playerId);
  if (idx === -1) return next;

  const [removed] = next.players.splice(idx, 1);
  if (removed.isHost && next.players.length > 0) {
    next.players[0].isHost = true;
  }

  if (next.currentTurnPlayerId === playerId && next.tableStatus === 'in_hand') {
    recomputeTurn(next, removed.seatIndex);
  }

  updatePots(next);
  return next;
}

export function setPlayerConnection(state: EngineState, playerId: string, isConnected: boolean): EngineState {
  const next = cloneState(state);
  const player = playerById(next, playerId);
  if (!player) return next;

  player.isConnected = isConnected;
  if (!isConnected) {
    if (next.tableStatus === 'in_hand' && player.status === 'active') {
      player.status = 'folded';
      player.hasActedThisRound = true;
      next.lastActionText = `${player.nickname} disconnected and folded`;
      if (next.currentTurnPlayerId === player.id) {
        const nextActor = nextActorAfter(next, player.seatIndex);
        next.currentTurnPlayerId = nextActor?.id ?? null;
      }
      evaluateHandProgress(next);
    } else if (next.tableStatus !== 'in_hand') {
      player.status = 'disconnected';
    }
  } else if (next.tableStatus !== 'in_hand') {
    player.status = player.chips > 0 ? 'active' : 'sitting_out';
  }

  return next;
}

export function canStartHand(state: EngineState): boolean {
  if (state.tableStatus === 'in_hand') return false;
  return activeForHandStart(state).length >= state.config.minPlayersToStart;
}

export function startHand(state: EngineState): EngineResult {
  const next = cloneState(state);
  if (!canStartHand(next)) {
    return { ok: false, error: `Need at least ${next.config.minPlayersToStart} active players`, state: next };
  }

  const participants = activeForHandStart(next);
  for (const player of next.players) {
    resetPlayerForNewHand(player);
  }

  rotateDealer(next, participants);
  assignBlinds(next, participants);

  next.tableStatus = 'in_hand';
  next.street = 'preflop';
  next.communityCards = [];
  next.deck = shuffleDeck(createDeck());
  next.currentBet = 0;
  next.minRaiseIncrement = next.config.bigBlind;
  next.minRaiseTo = next.config.bigBlind;
  next.lastAggressorId = null;
  next.winners = [];
  next.handNumber += 1;

  for (const player of participants) {
    const deal = dealCards(next.deck, 2);
    player.holeCards = deal.dealt;
    player.status = 'active';
    player.hasActedThisRound = false;
    next.deck = deal.rest;
  }

  if (next.smallBlindIndex !== null) {
    const sb = playerBySeat(next, next.smallBlindIndex);
    if (sb) {
      const paid = commitChips(sb, next.config.smallBlind);
      next.currentBet = Math.max(next.currentBet, paid);
      next.lastActionText = `${sb.nickname} posts small blind ${paid}`;
    }
  }

  if (next.bigBlindIndex !== null) {
    const bb = playerBySeat(next, next.bigBlindIndex);
    if (bb) {
      const paid = commitChips(bb, next.config.bigBlind);
      next.currentBet = Math.max(next.currentBet, paid);
      next.lastActionText = `${bb.nickname} posts big blind ${paid}`;
      if (paid > 0) {
        next.lastAggressorId = bb.id;
      }
    }
  }

  next.minRaiseTo = next.currentBet + next.minRaiseIncrement;
  setActingOrder(next);

  const first = firstToActPreflop(next);
  next.currentTurnPlayerId = first?.id ?? null;

  updatePots(next);
  evaluateHandProgress(next);

  return { ok: true, state: next };
}

export function resetTable(state: EngineState): EngineState {
  const next = cloneState(state);
  next.tableStatus = 'waiting';
  next.street = 'preflop';
  next.currentBet = 0;
  next.minRaiseTo = next.config.bigBlind;
  next.minRaiseIncrement = next.config.bigBlind;
  next.currentTurnPlayerId = null;
  next.communityCards = [];
  next.deck = [];
  next.pots = [];
  next.totalPot = 0;
  next.lastActionText = 'Table reset';
  next.winners = [];
  next.turnEndsAt = null;

  for (const player of next.players) {
    resetPlayerForNewHand(player);
  }

  return next;
}

export function getLegalActions(state: EngineState, playerId: string): { legalActions: LegalAction[]; amountToCall: number; minRaiseTo: number; maxBet: number } {
  const player = playerById(state, playerId);
  if (!player || state.currentTurnPlayerId !== playerId || !canTakeAction(player)) {
    return { legalActions: [], amountToCall: 0, minRaiseTo: state.minRaiseTo, maxBet: player?.chips ?? 0 };
  }

  const amountToCall = Math.max(0, state.currentBet - player.committedThisRound);
  const maxBet = player.chips;
  const legalActions: LegalAction[] = [{ type: 'fold' }];

  if (amountToCall === 0) {
    legalActions.push({ type: 'check' });
    if (player.chips > 0) {
      legalActions.push({ type: 'bet', minAmount: state.config.bigBlind, maxAmount: player.chips });
    }
  } else {
    if (player.chips >= amountToCall) {
      legalActions.push({ type: 'call' });
    }
    const raiseToMin = Math.max(state.minRaiseTo, state.currentBet + state.minRaiseIncrement);
    const maxRaiseTo = player.committedThisRound + player.chips;
    if (maxRaiseTo >= raiseToMin && player.chips > amountToCall) {
      legalActions.push({ type: 'raise', minAmount: raiseToMin, maxAmount: maxRaiseTo });
    }
  }

  if (player.chips > 0) {
    legalActions.push({ type: 'all_in' });
  }

  return { legalActions, amountToCall, minRaiseTo: state.minRaiseTo, maxBet };
}

function markEveryoneNeedsAction(state: EngineState, actorId: string): void {
  for (const player of state.players) {
    if (player.id === actorId) {
      player.hasActedThisRound = true;
      continue;
    }
    if (player.status === 'active') {
      player.hasActedThisRound = false;
    }
  }
}

function applyActionInternal(state: EngineState, player: EnginePlayer, action: ApplyActionInput): string | null {
  const amountToCall = Math.max(0, state.currentBet - player.committedThisRound);

  if (action.type === 'fold') {
    player.status = 'folded';
    player.hasActedThisRound = true;
    return `${player.nickname} folds`;
  }

  if (action.type === 'check') {
    if (amountToCall !== 0) return 'Cannot check when facing a bet';
    player.hasActedThisRound = true;
    return `${player.nickname} checks`;
  }

  if (action.type === 'call') {
    if (amountToCall <= 0) return 'Nothing to call';
    const paid = commitChips(player, amountToCall);
    player.hasActedThisRound = true;
    return `${player.nickname} calls ${paid}`;
  }

  if (action.type === 'bet') {
    if (state.currentBet !== 0) return 'Cannot bet after a bet exists; use raise';
    const amount = Math.floor(action.amount);
    if (amount < state.config.bigBlind) return `Minimum bet is ${state.config.bigBlind}`;
    if (amount > player.chips) return 'Insufficient chips';

    commitChips(player, amount);
    state.currentBet = player.committedThisRound;
    state.minRaiseIncrement = amount;
    state.minRaiseTo = state.currentBet + state.minRaiseIncrement;
    state.lastAggressorId = player.id;
    markEveryoneNeedsAction(state, player.id);
    return `${player.nickname} bets ${amount}`;
  }

  if (action.type === 'raise') {
    if (state.currentBet === 0) return 'Cannot raise without an existing bet';
    const raiseTo = Math.floor(action.amount);
    if (raiseTo < state.minRaiseTo) return `Minimum raise-to is ${state.minRaiseTo}`;
    const maxRaiseTo = player.committedThisRound + player.chips;
    if (raiseTo > maxRaiseTo) return 'Insufficient chips';

    const needed = raiseTo - player.committedThisRound;
    commitChips(player, needed);
    const raiseSize = raiseTo - state.currentBet;
    state.currentBet = raiseTo;
    state.minRaiseIncrement = raiseSize;
    state.minRaiseTo = state.currentBet + state.minRaiseIncrement;
    state.lastAggressorId = player.id;
    markEveryoneNeedsAction(state, player.id);
    return `${player.nickname} raises to ${raiseTo}`;
  }

  if (action.type === 'all_in') {
    if (player.chips <= 0) return 'No chips left';

    const before = player.committedThisRound;
    const pushed = commitChips(player, player.chips);
    const after = before + pushed;

    if (after > state.currentBet) {
      const raiseSize = after - state.currentBet;
      state.currentBet = after;
      if (raiseSize >= state.minRaiseIncrement) {
        state.minRaiseIncrement = raiseSize;
        state.minRaiseTo = state.currentBet + state.minRaiseIncrement;
        state.lastAggressorId = player.id;
        markEveryoneNeedsAction(state, player.id);
      } else {
        player.hasActedThisRound = true;
      }
      return `${player.nickname} is all-in for ${after}`;
    }

    player.hasActedThisRound = true;
    return `${player.nickname} is all-in`;
  }

  return 'Unknown action';
}

export function applyAction(state: EngineState, playerId: string, action: ApplyActionInput): EngineResult {
  const next = cloneState(state);

  if (next.tableStatus !== 'in_hand') {
    return { ok: false, error: 'No active hand', state: next };
  }

  if (next.currentTurnPlayerId !== playerId) {
    return { ok: false, error: 'Not your turn', state: next };
  }

  const player = playerById(next, playerId);
  if (!player) {
    return { ok: false, error: 'Player not found', state: next };
  }

  if (!canTakeAction(player)) {
    return { ok: false, error: 'Player cannot act', state: next };
  }

  const err = applyActionInternal(next, player, action);
  if (err && err.startsWith('Cannot')) {
    return { ok: false, error: err, state: next };
  }
  if (
    err &&
    (err.includes('Minimum') ||
      err === 'Insufficient chips' ||
      err === 'Nothing to call' ||
      err === 'No chips left' ||
      err === 'Unknown action')
  ) {
    return { ok: false, error: err, state: next };
  }

  next.lastActionText = err;
  updatePots(next);

  if (next.tableStatus === 'in_hand') {
    const nextActor = nextActorAfter(next, player.seatIndex);
    next.currentTurnPlayerId = nextActor?.id ?? null;
  }

  evaluateHandProgress(next);

  return { ok: true, state: next };
}

export function forceFoldCurrentPlayer(state: EngineState): EngineState {
  if (!state.currentTurnPlayerId || state.tableStatus !== 'in_hand') return state;
  const result = applyAction(state, state.currentTurnPlayerId, { type: 'fold' });
  return result.state;
}
