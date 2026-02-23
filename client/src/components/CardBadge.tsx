import type { Card } from '@poker/shared';
import { cardLabel } from '../lib/format';

interface Props {
  card?: Card;
  hidden?: boolean;
}

export function CardBadge({ card, hidden }: Props) {
  return (
    <div className={`card-badge ${hidden ? 'hidden' : ''}`}>
      {hidden ? '🂠' : card ? cardLabel(card) : ''}
    </div>
  );
}
