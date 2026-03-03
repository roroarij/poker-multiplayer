import type { ReactNode } from 'react';
import type { Card, LogEvent } from '@poker/shared';
import { cardLabel } from '../../lib/format';
import styles from './Table.module.css';

interface Props {
  entries: LogEvent[];
}

function CardChip({ card }: { card: Card }) {
  return <span className={styles.logCard}>{cardLabel(card)}</span>;
}

function renderEntry(entry: LogEvent): ReactNode {
  if (entry.type === 'PLAYER_ACTION') {
    return `${entry.playerName} ${entry.action}${entry.amount ? ` (${entry.amount})` : ''}`;
  }

  if (entry.type === 'POT') {
    return `${entry.message}${entry.amount ? ` (${entry.amount})` : ''}`;
  }

  if (entry.type === 'STREET') {
    return (
      <>
        <strong>{entry.street}</strong>
        <span> </span>
        {entry.cards.map((card, idx) => (
          <CardChip key={`${card.rank}-${card.suit}-${idx}`} card={card} />
        ))}
      </>
    );
  }

  return (
    <>
      <strong>SHOWDOWN</strong>
      <span> </span>
      {entry.winners.map((winner, index) => (
        <span key={`${winner.playerName}-${index}`}>
          {winner.playerName} +{winner.amount} ({winner.handName})
          {index < entry.winners.length - 1 ? ' | ' : ''}
        </span>
      ))}
    </>
  );
}

export function ActionLog({ entries }: Props) {
  return (
    <div className={styles.actionLog}>
      <div className={styles.logTitle}>Action Log</div>
      {entries.length ? (
        entries.map((entry, idx) => (
          <div key={`${entry.type}-${idx}`} className={styles.logLine}>
            {renderEntry(entry)}
          </div>
        ))
      ) : (
        <div className={styles.logLine}>No actions yet.</div>
      )}
    </div>
  );
}
