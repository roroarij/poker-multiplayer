import type { Card, PlayerSnapshot } from '@poker/shared';
import { CardBadge } from './CardBadge';

interface Props {
  player: PlayerSnapshot;
  isMe: boolean;
  holeCards: Card[];
  canKick: boolean;
  onKick: () => void;
}

export function Seat({ player, isMe, holeCards, canKick, onKick }: Props) {
  return (
    <div className={`seat ${player.isTurn ? 'turn' : ''}`} style={{ borderColor: player.color }}>
      <div className="seat-top">
        <div className="seat-name">
          {player.nickname}
          {player.isHost ? ' (Host)' : ''}
          {isMe ? ' (You)' : ''}
        </div>
        <div className="seat-badges">
          {player.isDealer ? <span className="badge">D</span> : null}
          {player.isSmallBlind ? <span className="badge">SB</span> : null}
          {player.isBigBlind ? <span className="badge">BB</span> : null}
        </div>
      </div>
      <div className="seat-meta">
        <span>{player.chips} chips</span>
        <span className={`status ${player.status}`}>{player.status}</span>
      </div>
      <div className="seat-cards">
        {isMe
          ? holeCards.map((card, idx) => <CardBadge key={`${card.rank}-${card.suit}-${idx}`} card={card} />)
          : [0, 1].map((n) => <CardBadge key={n} hidden />)}
      </div>
      {canKick ? (
        <button type="button" className="danger" onClick={onKick}>
          Remove
        </button>
      ) : null}
    </div>
  );
}
