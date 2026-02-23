import { describe, expect, it } from 'vitest';
import { evaluateBestHand } from '../src/engine/handEvaluator.js';

function c(rank: string, suit: string) {
  return { rank, suit } as never;
}

describe('hand evaluator', () => {
  it('detects straight flush', () => {
    const result = evaluateBestHand([
      c('A', 'spades'),
      c('K', 'spades'),
      c('Q', 'spades'),
      c('J', 'spades'),
      c('T', 'spades'),
      c('2', 'clubs'),
      c('3', 'diamonds'),
    ]);

    expect(result.category).toBe(8);
    expect(result.label).toBe('Straight Flush');
  });

  it('chooses full house over flush', () => {
    const result = evaluateBestHand([
      c('K', 'hearts'),
      c('K', 'clubs'),
      c('K', 'diamonds'),
      c('9', 'hearts'),
      c('9', 'spades'),
      c('2', 'hearts'),
      c('4', 'hearts'),
    ]);

    expect(result.category).toBe(6);
    expect(result.label).toBe('Full House');
  });

  it('handles wheel straight', () => {
    const result = evaluateBestHand([
      c('A', 'clubs'),
      c('2', 'diamonds'),
      c('3', 'hearts'),
      c('4', 'spades'),
      c('5', 'clubs'),
      c('Q', 'diamonds'),
      c('K', 'hearts'),
    ]);

    expect(result.category).toBe(4);
    expect(result.tiebreak[0]).toBe(5);
  });
});
