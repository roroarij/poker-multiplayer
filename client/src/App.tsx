import { useEffect, useMemo, useState } from 'react';
import type { ClientView, GameAction } from '@poker/shared';
import { socket } from './lib/socket';
import { useTicker } from './hooks/useTicker';
import { Table } from './components/table/Table';

function roomFromPath(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) {
    return parts[1].toUpperCase();
  }
  return '';
}

function derivePlayerAction(lastActionText: string, names: { id: string; nickname: string }[]): { playerId: string; action: string } | null {
  const matched = [...names]
    .sort((a, b) => b.nickname.length - a.nickname.length)
    .find((player) => lastActionText.startsWith(player.nickname));

  if (!matched) {
    return null;
  }

  return {
    playerId: matched.id,
    action: lastActionText.slice(matched.nickname.length).trim(),
  };
}

export function App() {
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(roomFromPath());
  const [roomId, setRoomId] = useState(roomFromPath());
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [lastActionByPlayer, setLastActionByPlayer] = useState<Record<string, string | null>>({});
  const now = useTicker(500);

  useEffect(() => {
    const onState = (next: ClientView) => {
      setView(next);
      const actionText = next.game.lastActionText;
      if (actionText) {
        setActionLog((prev) => {
          if (prev[0] === actionText) return prev;
          return [actionText, ...prev].slice(0, 12);
        });

        const parsed = derivePlayerAction(
          actionText,
          next.game.players.map((player) => ({ id: player.id, nickname: player.nickname })),
        );

        if (parsed) {
          setLastActionByPlayer((prev) => ({ ...prev, [parsed.playerId]: parsed.action || null }));
        }
      }
    };

    const onError = (message: string) => setError(message);
    const onJoined = (payload: { roomId: string; playerId: string; sessionToken: string }) => {
      setRoomId(payload.roomId);
      setPlayerId(payload.playerId);
      localStorage.setItem(`poker_session_${payload.roomId}`, payload.sessionToken);
      window.history.replaceState({}, '', `/room/${payload.roomId}`);
    };

    socket.on('room:state', onState);
    socket.on('room:error', onError);
    socket.on('room:joined', onJoined);

    return () => {
      socket.off('room:state', onState);
      socket.off('room:error', onError);
      socket.off('room:joined', onJoined);
    };
  }, []);

  const game = view?.game;

  useEffect(() => {
    if (!game?.winners?.length) return;
    const summary = game.winners
      .map((winner) => {
        const player = game.players.find((p) => p.id === winner.playerId);
        return `${player?.nickname ?? winner.playerId} +${winner.payout} (${winner.rankLabel})`;
      })
      .join(', ');
    setActionLog((prev) => [summary, ...prev].slice(0, 12));
  }, [game?.winners, game?.players]);

  const handleCreate = () => {
    setError(null);
    socket.emit('room:create', { nickname }, (result) => {
      if (!result.ok) setError(result.error);
    });
  };

  const handleJoin = () => {
    if (!joinCode) return;
    setError(null);
    const code = joinCode.toUpperCase();
    const sessionToken = localStorage.getItem(`poker_session_${code}`) ?? undefined;
    const payload = sessionToken
      ? { roomId: code, nickname, sessionToken }
      : { roomId: code, nickname };
    socket.emit('room:join', payload, (result) => {
      if (!result.ok) setError(result.error);
    });
  };

  const handleAction = (action: GameAction) => {
    if (!roomId) return;
    socket.emit('game:action', { roomId, action });
  };

  const heroSubtitle = useMemo(() => {
    if (!game?.currentTurnPlayerId) return 'Waiting for players';
    const turnPlayer = game.players.find((player) => player.id === game.currentTurnPlayerId);
    return turnPlayer ? `${turnPlayer.nickname} to act` : 'Table running';
  }, [game]);

  return (
    <div className="appFrame">
      <header className="topHeader">
        <h1>Hold'em Arena</h1>
        <p>{heroSubtitle}</p>
      </header>

      {!game ? (
        <section className="lobbyCard">
          <input
            placeholder="Nickname"
            value={nickname}
            maxLength={20}
            onChange={(event) => setNickname(event.target.value)}
          />
          <input
            placeholder="Room code"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
          <div className="lobbyActions">
            <button onClick={handleCreate} disabled={!nickname.trim()}>Create Room</button>
            <button onClick={handleJoin} disabled={!nickname.trim() || !joinCode.trim()}>Join Room</button>
          </div>
          {error ? <div className="errorBox">{error}</div> : null}
        </section>
      ) : (
        <>
          <Table
            view={view}
            playerId={playerId}
            nowMs={now}
            lastActionByPlayer={lastActionByPlayer}
            actionLog={actionLog}
            onAction={handleAction}
            onStart={() => socket.emit('room:start', game.roomId)}
            onReset={() => socket.emit('room:reset', game.roomId)}
            onKick={(targetPlayerId) => socket.emit('room:kick', { roomId: game.roomId, targetPlayerId })}
            onCopyLink={() => navigator.clipboard.writeText(window.location.href)}
          />
          {error ? <div className="errorBox">{error}</div> : null}
        </>
      )}
    </div>
  );
}
