import { useMemo } from 'react';
import type { Card, ClientView, GameAction, PlayerSnapshot } from '@poker/shared';
import { Seat } from './Seat';
import { PotDisplay } from './PotDisplay';
import { CommunityCards } from './CommunityCards';
import { ActionPanel } from './ActionPanel';
import { ActionLog } from './ActionLog';
import styles from './Table.module.css';

interface Props {
  view: ClientView;
  playerId: string | null;
  nowMs: number;
  lastActionByPlayer: Record<string, string | null>;
  actionLog: string[];
  onAction: (action: GameAction) => void;
  onStart: () => void;
  onReset: () => void;
  onKick: (targetPlayerId: string) => void;
  onCopyLink: () => void;
}

const MAX_SEATS = 9;

function turnRatio(turnEndsAt: number | null, nowMs: number): number {
  if (!turnEndsAt) return 0;
  const remaining = Math.max(0, turnEndsAt - nowMs);
  return Math.min(1, remaining / 30000);
}

export function Table({ view, playerId, nowMs, lastActionByPlayer, actionLog, onAction, onStart, onReset, onKick, onCopyLink }: Props) {
  const game = view.game;
  const me = view.me;

  const seatedPlayers = useMemo(
    () => [...game.players].sort((a, b) => a.seatIndex - b.seatIndex).slice(0, MAX_SEATS),
    [game.players],
  );

  const slots = useMemo<(PlayerSnapshot | null)[]>(() => {
    const next = Array.from({ length: MAX_SEATS }, () => null as PlayerSnapshot | null);
    seatedPlayers.forEach((player, idx) => {
      next[idx] = player;
    });
    return next;
  }, [seatedPlayers]);

  const waitingFor = game.players.find((player) => player.id === game.currentTurnPlayerId);
  const isHost = Boolean(playerId && game.hostPlayerId === playerId);

  return (
    <section className={styles.stage}>
      <div className={styles.metaBar}>
        <div>Room {game.roomId}</div>
        <div>{game.blindSmall}/{game.blindBig}</div>
        <button onClick={onCopyLink}>Copy Invite Link</button>
      </div>

      <div className={styles.tableShell}>
        <div className={styles.tableOval}>
          <PotDisplay totalPot={game.totalPot} pots={game.pots} winners={game.winners ?? []} />
          <CommunityCards cards={game.communityCards} />
          <div className={styles.centerStatus}>{game.street.toUpperCase()}</div>
        </div>

        {slots.map((player, slotIndex) => (
          <Seat
            key={player?.id ?? `empty-${slotIndex}`}
            player={player}
            slotIndex={slotIndex}
            isMe={Boolean(player && player.id === playerId)}
            meCards={player?.id === playerId ? (me?.holeCards as Card[]) ?? [] : []}
            lastAction={player ? lastActionByPlayer[player.id] ?? null : null}
            turnRemainingRatio={player?.isTurn ? turnRatio(game.turnEndsAt, nowMs) : 0}
            canKick={Boolean(player && isHost && player.id !== playerId)}
            onKick={() => {
              if (player) onKick(player.id);
            }}
          />
        ))}
      </div>

      <ActionPanel view={view} onAction={onAction} waitingForName={waitingFor?.nickname ?? null} />

      <div className={styles.utilityRow}>
        {isHost ? (
          <>
            <button onClick={onStart}>Start Hand</button>
            <button onClick={onReset}>Reset Table</button>
          </>
        ) : null}
      </div>

      <ActionLog entries={actionLog} />
    </section>
  );
}
