import type { Card, PlayerSnapshot } from '@poker/shared';
import { cardLabel } from '../../lib/format';
import { BlindBadge } from './BlindBadge';
import { DealerButton } from './DealerButton';
import styles from './Table.module.css';

interface Props {
  player: PlayerSnapshot | null;
  slotIndex: number;
  isMe: boolean;
  meCards: Card[];
  lastAction: string | null;
  turnRemainingRatio: number;
  canKick: boolean;
  onKick: () => void;
}

function TurnRing({ ratio }: { ratio: number }) {
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);

  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className={styles.turnRing}>
      <circle cx="15" cy="15" r={radius} className={styles.turnRingTrack} />
      <circle
        cx="15"
        cy="15"
        r={radius}
        className={styles.turnRingProgress}
        style={{ strokeDasharray: `${circumference}px`, strokeDashoffset: `${offset}px` }}
      />
    </svg>
  );
}

export function Seat({ player, slotIndex, isMe, meCards, lastAction, turnRemainingRatio, canKick, onKick }: Props) {
  if (!player) {
    return (
      <div className={`${styles.seatWrap} ${styles[`slot${slotIndex}`]}`}>
        <div className={`${styles.seat} ${styles.emptySeat}`}>
          <span>SIT</span>
        </div>
      </div>
    );
  }

  const isFolded = player.status === 'folded' || player.status === 'disconnected';

  return (
    <div className={`${styles.seatWrap} ${styles[`slot${slotIndex}`]}`}>
      <div className={`${styles.seat} ${player.isTurn ? styles.activeSeat : ''} ${isFolded ? styles.foldedSeat : ''}`}>
        <div className={styles.seatHeader}>
          <span className={styles.playerName}>{player.nickname}{isMe ? ' (You)' : ''}</span>
          <div className={styles.seatBadges}>
            {canKick ? <button className={styles.kickBtn} onClick={onKick}>×</button> : null}
            {player.isDealer ? <DealerButton /> : null}
            {player.isSmallBlind ? <BlindBadge type="SB" /> : null}
            {player.isBigBlind ? <BlindBadge type="BB" /> : null}
            {player.isTurn ? <TurnRing ratio={turnRemainingRatio} /> : null}
          </div>
        </div>
        <div className={styles.playerStack}>{player.chips}</div>
        <div className={styles.cardsRow}>
          {isMe
            ? meCards.map((card, idx) => (
                <div key={`${card.rank}-${card.suit}-${idx}`} className={`${styles.tableCard} ${styles.dealt}`}>
                  {cardLabel(card)}
                </div>
              ))
            : [0, 1].map((idx) => (
                <div key={idx} className={`${styles.tableCard} ${styles.hiddenCard}`}>
                  🂠
                </div>
              ))}
        </div>
        {lastAction ? <div className={styles.lastActionTag}>{lastAction}</div> : null}
      </div>
      {player.committedThisRound > 0 ? <div className={styles.betPuck}>{player.committedThisRound}</div> : null}
    </div>
  );
}
