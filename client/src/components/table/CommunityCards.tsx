import type { Card } from '@poker/shared';
import { cardLabel } from '../../lib/format';
import styles from './Table.module.css';

interface Props {
  cards: Card[];
}

export function CommunityCards({ cards }: Props) {
  return (
    <div className={styles.communityCards}>
      {Array.from({ length: 5 }, (_, idx) => {
        const card = cards[idx];
        return (
          <div key={idx} className={`${styles.tableCard} ${card ? styles.dealt : styles.placeholder}`}>
            {card ? cardLabel(card) : ''}
          </div>
        );
      })}
    </div>
  );
}
