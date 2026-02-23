import type { Card } from '@poker/shared';

const suitMap: Record<Card['suit'], string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

export function cardLabel(card: Card): string {
  return `${card.rank}${suitMap[card.suit]}`;
}

export function shortId(id: string): string {
  return id.slice(0, 6);
}
