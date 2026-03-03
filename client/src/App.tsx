import { useEffect, useMemo, useState } from 'react';
import type { BlindLevel, ClientView, GameAction, LogEvent, PublicRoomSummary, TableSettings } from '@poker/shared';
import { socket } from './lib/socket';
import { useTicker } from './hooks/useTicker';
import { Table } from './components/table/Table';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function roomFromPath(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) {
    return parts[1].toUpperCase();
  }
  return '';
}

function parseBlindSchedule(raw: string): BlindLevel[] | undefined {
  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [sbRaw, bbRaw] = part.split('/');
      const sb = Number(sbRaw);
      const bb = Number(bbRaw);
      if (!Number.isInteger(sb) || !Number.isInteger(bb) || sb <= 0 || bb <= sb) {
        return null;
      }
      return { sb, bb };
    })
    .filter((level): level is BlindLevel => Boolean(level));

  return entries.length ? entries : undefined;
}

function mapSeatActions(logEvents: LogEvent[]): Record<string, string> {
  const byPlayer: Record<string, string> = {};
  for (const event of logEvents) {
    if (event.type !== 'PLAYER_ACTION') continue;
    if (!byPlayer[event.playerName]) {
      byPlayer[event.playerName] = event.action;
    }
  }
  return byPlayer;
}

export function App() {
  const initialNickname = localStorage.getItem('poker_nickname') ?? '';
  const routeRoomId = roomFromPath();
  const isRoomRoute = Boolean(routeRoomId);

  const [nickname, setNickname] = useState(initialNickname);
  const [joinCode, setJoinCode] = useState(routeRoomId);
  const [roomId, setRoomId] = useState(routeRoomId);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTriedRouteJoin, setHasTriedRouteJoin] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Partial<TableSettings>>({});
  const [blindScheduleText, setBlindScheduleText] = useState('');
  const now = useTicker(500);

  useEffect(() => {
    localStorage.setItem('poker_nickname', nickname);
  }, [nickname]);

  useEffect(() => {
    const onState = (next: ClientView) => {
      setView(next);
      setRoomId(next.game.roomId);
      setJoinCode(next.game.roomId);
      setSettingsDraft(next.game.settings);
      setBlindScheduleText(next.game.settings.blindSchedule.map((level) => `${level.sb}/${level.bb}`).join(', '));
    };

    const onError = (message: string) => setError(message);
    const onJoined = (payload: { roomId: string; playerId: string; sessionToken: string }) => {
      setRoomId(payload.roomId);
      setPlayerId(payload.playerId);
      localStorage.setItem(`poker_session_${payload.roomId}`, payload.sessionToken);
      window.history.replaceState({}, '', `/room/${payload.roomId}`);
    };

    const onPublicRooms = (rooms: PublicRoomSummary[]) => setPublicRooms(rooms);

    socket.on('room:state', onState);
    socket.on('room:error', onError);
    socket.on('room:joined', onJoined);
    socket.on('lobby:public-rooms', onPublicRooms);
    socket.emit('lobby:get-public-rooms');

    return () => {
      socket.off('room:state', onState);
      socket.off('room:error', onError);
      socket.off('room:joined', onJoined);
      socket.off('lobby:public-rooms', onPublicRooms);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${serverUrl}/public-rooms`);
        if (!response.ok) return;
        const payload = (await response.json()) as { rooms: PublicRoomSummary[] };
        setPublicRooms(payload.rooms);
      } catch {
        // no-op
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isRoomRoute || hasTriedRouteJoin || view) return;
    if (!nickname.trim()) return;

    const sessionToken = localStorage.getItem(`poker_session_${routeRoomId}`) ?? undefined;
    const payload = sessionToken
      ? { roomId: routeRoomId, nickname, sessionToken }
      : { roomId: routeRoomId, nickname };

    setHasTriedRouteJoin(true);
    socket.emit('room:join', payload, (result) => {
      if (!result.ok) {
        setError(result.error);
      }
    });
  }, [hasTriedRouteJoin, isRoomRoute, nickname, routeRoomId, view]);

  const game = view?.game;

  const lastActionByPlayer = useMemo(() => {
    if (!game) return {};
    const byName = mapSeatActions(game.logEvents);
    const out: Record<string, string> = {};
    for (const player of game.players) {
      const action = byName[player.nickname];
      if (action) {
        out[player.id] = action;
      }
    }
    return out;
  }, [game]);

  const heroSubtitle = useMemo(() => {
    if (!game?.currentTurnPlayerId) return 'Waiting for players';
    const turnPlayer = game.players.find((player) => player.id === game.currentTurnPlayerId);
    return turnPlayer ? `${turnPlayer.nickname} to act` : 'Table running';
  }, [game]);

  const handleCreate = () => {
    setError(null);
    socket.emit('room:create', { nickname }, (result) => {
      if (!result.ok) setError(result.error);
    });
  };

  const handleJoin = (targetRoomId?: string) => {
    const code = (targetRoomId ?? joinCode).toUpperCase();
    if (!code) return;

    setError(null);
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

  const applySettings = () => {
    if (!game) return;
    const parsedSchedule = parseBlindSchedule(blindScheduleText);
    const settingsPatch: Partial<TableSettings> = { ...settingsDraft };
    if (parsedSchedule) {
      settingsPatch.blindSchedule = parsedSchedule;
    }

    socket.emit('room:update-settings', { roomId: game.roomId, settings: settingsPatch });
  };

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

          {isRoomRoute ? (
            <button onClick={() => handleJoin(routeRoomId)} disabled={!nickname.trim()}>
              Join Room {routeRoomId}
            </button>
          ) : (
            <>
              <input
                placeholder="Room code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              />
              <div className="lobbyActions">
                <button onClick={handleCreate} disabled={!nickname.trim()}>Create Room</button>
                <button onClick={() => handleJoin()} disabled={!nickname.trim() || !joinCode.trim()}>Join Room</button>
              </div>

              <div className="publicLobby">
                <strong>Join a public game</strong>
                {publicRooms.length ? publicRooms.map((room) => (
                  <div key={room.roomId} className="publicRoomRow">
                    <span>{room.roomName}</span>
                    <span>{room.smallBlind}/{room.bigBlind}</span>
                    <span>{room.playersSeated}/{room.maxSeats}</span>
                    <span>{room.status}</span>
                    <button onClick={() => handleJoin(room.roomId)} disabled={!nickname.trim()}>Join</button>
                  </div>
                )) : <div className="mutedText">No public rooms right now.</div>}
              </div>
            </>
          )}

          {error ? <div className="errorBox">{error}</div> : null}
        </section>
      ) : (
        <>
          <Table
            view={view}
            playerId={playerId}
            nowMs={now}
            lastActionByPlayer={lastActionByPlayer}
            actionLog={game.logEvents}
            onAction={handleAction}
            onStart={() => socket.emit('room:start', game.roomId)}
            onReset={() => socket.emit('room:reset', game.roomId)}
            onKick={(targetPlayerId) => socket.emit('room:kick', { roomId: game.roomId, targetPlayerId })}
            onRebuy={() => socket.emit('room:rebuy', { roomId: game.roomId })}
            onSitOut={() => socket.emit('room:sit-out', { roomId: game.roomId })}
            onSitIn={() => socket.emit('room:sit-in', { roomId: game.roomId })}
            onLeaveSeat={() => socket.emit('room:leave-seat', { roomId: game.roomId })}
            onCopyLink={() => navigator.clipboard.writeText(window.location.href)}
          />

          {isHost ? (
            <section className="settingsCard">
              <h3>Table Settings</h3>
              <div className="settingsGrid">
                <label>Room Name<input value={settingsDraft.roomName ?? ''} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, roomName: event.target.value }))} /></label>
                <label>Visibility
                  <select value={settingsDraft.visibility ?? 'unlisted'} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, visibility: event.target.value as TableSettings['visibility'] }))}>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                <label>SB<input type="number" value={settingsDraft.smallBlind ?? 10} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, smallBlind: Number(event.target.value) }))} /></label>
                <label>BB<input type="number" value={settingsDraft.bigBlind ?? 20} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, bigBlind: Number(event.target.value) }))} /></label>
                <label>Starting Stack<input type="number" value={settingsDraft.startingStack ?? 1000} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, startingStack: Number(event.target.value) }))} /></label>
                <label>Min Players<input type="number" value={settingsDraft.minPlayersToStart ?? 2} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, minPlayersToStart: Number(event.target.value) }))} /></label>
                <label>Turn Timeout<input type="number" value={settingsDraft.turnTimeoutSeconds ?? 30} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, turnTimeoutSeconds: Number(event.target.value) }))} /></label>
                <label>Allow Rebuy
                  <select value={String(settingsDraft.allowRebuy ?? true)} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, allowRebuy: event.target.value === 'true' }))}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <label>Rebuy Stack<input type="number" value={settingsDraft.rebuyStack ?? 1000} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, rebuyStack: Number(event.target.value) }))} /></label>
                <label>Rebuy Window (s)<input type="number" value={settingsDraft.rebuyWindowSeconds ?? 60} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, rebuyWindowSeconds: Number(event.target.value) }))} /></label>
                <label>Max Rebuys<input type="number" value={settingsDraft.maxRebuysPerPlayer ?? ''} placeholder="unlimited" onChange={(event) => setSettingsDraft((prev) => ({ ...prev, maxRebuysPerPlayer: event.target.value ? Number(event.target.value) : null }))} /></label>
                <label>Blind Levels
                  <select value={String(settingsDraft.blindLevelsEnabled ?? false)} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, blindLevelsEnabled: event.target.value === 'true' }))}>
                    <option value="false">Off</option>
                    <option value="true">On</option>
                  </select>
                </label>
                <label>Level Duration (s)<input type="number" value={settingsDraft.blindLevelDurationSeconds ?? 600} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, blindLevelDurationSeconds: Number(event.target.value) }))} /></label>
              </div>
              <label>Blind Schedule (format: 10/20,20/40,30/60)
                <input value={blindScheduleText} onChange={(event) => setBlindScheduleText(event.target.value)} />
              </label>
              <button onClick={applySettings}>Apply Settings</button>
            </section>
          ) : null}

          {error ? <div className="errorBox">{error}</div> : null}
        </>
      )}
    </div>
  );
}
