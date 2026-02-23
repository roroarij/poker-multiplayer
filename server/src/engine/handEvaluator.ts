import type { Card } from '@poker/shared';
import { RANK_VALUE } from './cards.js';

export interface EvaluatedHand {
  category: number;
  label: string;
  tiebreak: number[];
  bestFive: Card[];
}

interface ScoredFive {
  category: number;
  label: string;
  tiebreak: number[];
}

const CATEGORY_LABELS: Record<number, string> = {
  8: 'Straight Flush',
  7: 'Four of a Kind',
  6: 'Full House',
  5: 'Flush',
  4: 'Straight',
  3: 'Three of a Kind',
  2: 'Two Pair',
  1: 'Pair',
  0: 'High Card',
};

function compareScore(a: ScoredFive, b: ScoredFive): number {
  if (a.category !== b.category) return a.category - b.category;
  const maxLen = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function sortedValues(cards: Card[]): number[] {
  return cards
    .map((card) => RANK_VALUE[card.rank])
    .sort((a, b) => b - a);
}

function straightHigh(values: number[]): number | null {
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  if (uniq.includes(14)) {
    uniq.push(1);
  }

  let run = 1;
  for (let i = 1; i < uniq.length; i += 1) {
    if (uniq[i - 1] - 1 === uniq[i]) {
      run += 1;
      if (run >= 5) {
        return uniq[i - 4];
      }
    } else {
      run = 1;
    }
  }

  return null;
}

export function evaluateFiveCards(cards: Card[]): ScoredFive {
  if (cards.length !== 5) {
    throw new Error('evaluateFiveCards expects exactly 5 cards');
  }

  const values = sortedValues(cards);
  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(values);

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const groups = [...counts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (isFlush && straight !== null) {
    return {
      category: 8,
      label: CATEGORY_LABELS[8],
      tiebreak: [straight],
    };
  }

  if (groups[0]?.[1] === 4) {
    const quad = groups[0][0];
    const kicker = groups[1][0];
    return {
      category: 7,
      label: CATEGORY_LABELS[7],
      tiebreak: [quad, kicker],
    };
  }

  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
    return {
      category: 6,
      label: CATEGORY_LABELS[6],
      tiebreak: [groups[0][0], groups[1][0]],
    };
  }

  if (isFlush) {
    return {
      category: 5,
      label: CATEGORY_LABELS[5],
      tiebreak: values,
    };
  }

  if (straight !== null) {
    return {
      category: 4,
      label: CATEGORY_LABELS[4],
      tiebreak: [straight],
    };
  }

  if (groups[0]?.[1] === 3) {
    const kickers = groups.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      category: 3,
      label: CATEGORY_LABELS[3],
      tiebreak: [groups[0][0], ...kickers],
    };
  }

  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2][0];
    return {
      category: 2,
      label: CATEGORY_LABELS[2],
      tiebreak: [highPair, lowPair, kicker],
    };
  }

  if (groups[0]?.[1] === 2) {
    const pair = groups[0][0];
    const kickers = groups.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      category: 1,
      label: CATEGORY_LABELS[1],
      tiebreak: [pair, ...kickers],
    };
  }

  return {
    category: 0,
    label: CATEGORY_LABELS[0],
    tiebreak: values,
  };
}

function combinations(cards: Card[], choose: number): Card[][] {
  const out: Card[][] = [];
  const current: Card[] = [];

  function walk(index: number): void {
    if (current.length === choose) {
      out.push([...current]);
      return;
    }
    if (index >= cards.length) {
      return;
    }

    current.push(cards[index]);
    walk(index + 1);
    current.pop();
    walk(index + 1);
  }

  walk(0);
  return out;
}

export function evaluateBestHand(sevenCards: Card[]): EvaluatedHand {
  if (sevenCards.length < 5 || sevenCards.length > 7) {
    throw new Error('evaluateBestHand expects 5 to 7 cards');
  }

  let bestScore: ScoredFive | null = null;
  let bestFive: Card[] = [];

  for (const combo of combinations(sevenCards, 5)) {
    const score = evaluateFiveCards(combo);
    if (!bestScore || compareScore(score, bestScore) > 0) {
      bestScore = score;
      bestFive = combo;
    }
  }

  if (!bestScore) {
    throw new Error('No hand combinations available');
  }

  return {
    category: bestScore.category,
    label: bestScore.label,
    tiebreak: bestScore.tiebreak,
    bestFive,
  };
}

export function compareEvaluatedHands(a: EvaluatedHand, b: EvaluatedHand): number {
  return compareScore(
    { category: a.category, tiebreak: a.tiebreak, label: a.label },
    { category: b.category, tiebreak: b.tiebreak, label: b.label },
  );
}
