import { useMemo } from 'react';
import type { Card, ClientView, GameAction, LogEvent, PlayerSnapshot } from '@poker/shared';
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
  actionLog: LogEvent[];
  onAction: (action: GameAction) => void;
  onStart: () => void;
  onReset: () => void;
  onKick: (targetPlayerId: string) => void;
  onRebuy: () => void;
  onSitOut: () => void;
  onSitIn: () => void;
  onLeaveSeat: () => void;
  onCopyLink: () => void;
}

function turnRatio(turnEndsAt: number | null, timeoutSeconds: number, nowMs: number): number {
  if (!turnEndsAt) return 0;
  const remaining = Math.max(0, turnEndsAt - nowMs);
  return Math.min(1, remaining / (timeoutSeconds * 1000));
}

export function Table({
  view,
  playerId,
  nowMs,
  lastActionByPlayer,
  actionLog,
  onAction,
  onStart,
  onReset,
  onKick,
  onRebuy,
  onSitOut,
  onSitIn,
  onLeaveSeat,
  onCopyLink,
}: Props) {
  const game = view.game;
  const me = view.me;
  const hero = game.players.find((player) => player.id === playerId);
  const maxSeats = game.settings.maxSeats;

  const seatedPlayers = useMemo(
    () => [...game.players].sort((a, b) => a.seatIndex - b.seatIndex).slice(0, maxSeats),
    [game.players, maxSeats],
  );

  const slots = useMemo<(PlayerSnapshot | null)[]>(() => {
    const next = Array.from({ length: maxSeats }, () => null as PlayerSnapshot | null);
    seatedPlayers.forEach((player, idx) => {
      next[idx] = player;
    });
    return next;
  }, [seatedPlayers, maxSeats]);

  const waitingFor = game.players.find((player) => player.id === game.currentTurnPlayerId);
  const isHost = Boolean(playerId && game.hostPlayerId === playerId);
  const nextLevelSeconds = game.nextLevelAt ? Math.max(0, Math.ceil((game.nextLevelAt - nowMs) / 1000)) : null;
  const rebuySeconds = hero?.rebuyAvailableUntil ? Math.max(0, Math.ceil((hero.rebuyAvailableUntil - nowMs) / 1000)) : null;

  return (
    <section className={styles.stage}>
      <div className={styles.metaBar}>
        <div>Room {game.roomId}</div>
        <div>{game.blindSmall}/{game.blindBig} · {game.roomName}</div>
        {game.settings.blindLevelsEnabled ? <div>Next level: {nextLevelSeconds ?? '--'}s</div> : null}
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
            turnRemainingRatio={player?.isTurn ? turnRatio(game.turnEndsAt, game.settings.turnTimeoutSeconds, nowMs) : 0}
            canKick={Boolean(player && isHost && player.id !== playerId)}
            onKick={() => {
              if (player) onKick(player.id);
            }}
          />
        ))}
      </div>

      <ActionPanel view={view} onAction={onAction} waitingForName={waitingFor?.nickname ?? null} />

      <div className={styles.utilityRow}>
        {(hero?.status === 'busted' || (hero?.status === 'sitting_out' && hero.chips === 0 && game.settings.allowRebuy)) ? (
          <button onClick={onRebuy}>BUSTED — Rebuy{rebuySeconds !== null ? ` (${rebuySeconds}s)` : ''}</button>
        ) : null}
        {hero?.status === 'sitting_out' && hero.chips > 0 ? <button onClick={onSitIn}>Sit Back In</button> : null}
        {hero?.status === 'active' ? <button onClick={onSitOut}>Sit Out</button> : null}
        <button onClick={onLeaveSeat}>Leave Seat</button>
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
