import { useEffect, useMemo, useState } from 'react';
import type { ClientView, GameAction } from '@poker/shared';
import { socket } from './lib/socket';
import { CardBadge } from './components/CardBadge';
import { Seat } from './components/Seat';
import { ActionPanel } from './components/ActionPanel';
import { useTicker } from './hooks/useTicker';

function roomFromPath(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) {
    return parts[1].toUpperCase();
  }
  return '';
}

export function App() {
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(roomFromPath());
  const [roomId, setRoomId] = useState(roomFromPath());
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useTicker(500);

  useEffect(() => {
    const onState = (next: ClientView) => setView(next);
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

  const me = view?.me;
  const game = view?.game;

  const turnSeconds = useMemo(() => {
    if (!game?.turnEndsAt) return null;
    const delta = Math.max(0, game.turnEndsAt - now);
    return Math.ceil(delta / 1000);
  }, [game?.turnEndsAt, now]);

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

  const isHost = Boolean(game && playerId && game.hostPlayerId === playerId);

  return (
    <div className="app-shell">
      <header>
        <h1>Texas Hold'em Live</h1>
        <p>Realtime browser poker room</p>
      </header>

      {!game ? (
        <section className="lobby-card">
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
          <div className="lobby-actions">
            <button onClick={handleCreate} disabled={!nickname.trim()}>
              Create Room
            </button>
            <button onClick={handleJoin} disabled={!nickname.trim() || !joinCode.trim()}>
              Join Room
            </button>
          </div>
          {error ? <div className="error">{error}</div> : null}
        </section>
      ) : (
        <section className="table-layout">
          <div className="table-area">
            <div className="table-felt">
              <div className="community-row">
                {game.communityCards.map((card, idx) => (
                  <CardBadge key={`${card.rank}-${card.suit}-${idx}`} card={card} />
                ))}
              </div>
              <div className="pot">Pot: {game.totalPot}</div>
              <div className="street">Street: {game.street}</div>
              <div className="turn-timer">{turnSeconds !== null ? `Turn: ${turnSeconds}s` : 'Waiting'}</div>
              <div className="last-action">{game.lastActionText ?? 'No recent action'}</div>
            </div>

            <div className="seats-grid">
              {game.players.map((player) => (
                <Seat
                  key={player.id}
                  player={player}
                  isMe={player.id === playerId}
                  holeCards={me?.holeCards ?? []}
                  canKick={Boolean(isHost && player.id !== playerId)}
                  onKick={() => socket.emit('room:kick', { roomId: game.roomId, targetPlayerId: player.id })}
                />
              ))}
            </div>
          </div>

          <aside>
            <ActionPanel view={view} roomId={game.roomId} onAction={handleAction} />
            <div className="panel">
              <button onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy Invite Link</button>
              {isHost ? (
                <>
                  <button onClick={() => socket.emit('room:start', game.roomId)}>Start Hand</button>
                  <button onClick={() => socket.emit('room:reset', game.roomId)}>Reset Table</button>
                </>
              ) : null}
            </div>
            {game.winners?.length ? (
              <div className="panel">
                <div className="panel-header">Showdown</div>
                {game.winners.map((winner) => {
                  const player = game.players.find((p) => p.id === winner.playerId);
                  return (
                    <div key={winner.playerId} className="panel-row">
                      {player?.nickname ?? winner.playerId}: +{winner.payout} ({winner.rankLabel})
                    </div>
                  );
                })}
              </div>
            ) : null}
            {error ? <div className="error">{error}</div> : null}
          </aside>
        </section>
      )}
    </div>
  );
}
