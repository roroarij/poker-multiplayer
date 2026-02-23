import { useEffect, useRef, useState } from 'react';
import type { Pot, ShowdownResult } from '@poker/shared';
import styles from './Table.module.css';

interface Props {
  totalPot: number;
  pots: Pot[];
  winners: ShowdownResult[];
}

export function PotDisplay({ totalPot, pots, winners }: Props) {
  const previousPot = useRef(totalPot);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (totalPot !== previousPot.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 420);
      previousPot.current = totalPot;
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [totalPot]);

  return (
    <div className={styles.potStack}>
      <div className={`${styles.potAmount} ${pulse ? styles.potPulse : ''}`}>Pot {totalPot}</div>
      {pots.length > 1 ? (
        <div className={styles.sidePots}>
          {pots.slice(1).map((pot, idx) => (
            <span key={idx}>Side {idx + 1}: {pot.amount}</span>
          ))}
        </div>
      ) : null}
      {winners.length ? <div className={styles.potToWinner}>Payouting to winner(s)</div> : null}
    </div>
  );
}
