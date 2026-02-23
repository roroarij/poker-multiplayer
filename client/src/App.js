import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { socket } from './lib/socket';
import { CardBadge } from './components/CardBadge';
import { Seat } from './components/Seat';
import { ActionPanel } from './components/ActionPanel';
import { useTicker } from './hooks/useTicker';
function roomFromPath() {
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
    const [playerId, setPlayerId] = useState(null);
    const [view, setView] = useState(null);
    const [error, setError] = useState(null);
    const now = useTicker(500);
    useEffect(() => {
        const onState = (next) => setView(next);
        const onError = (message) => setError(message);
        const onJoined = (payload) => {
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
        if (!game?.turnEndsAt)
            return null;
        const delta = Math.max(0, game.turnEndsAt - now);
        return Math.ceil(delta / 1000);
    }, [game?.turnEndsAt, now]);
    const handleCreate = () => {
        setError(null);
        socket.emit('room:create', { nickname }, (result) => {
            if (!result.ok)
                setError(result.error);
        });
    };
    const handleJoin = () => {
        if (!joinCode)
            return;
        setError(null);
        const code = joinCode.toUpperCase();
        const sessionToken = localStorage.getItem(`poker_session_${code}`) ?? undefined;
        const payload = sessionToken
            ? { roomId: code, nickname, sessionToken }
            : { roomId: code, nickname };
        socket.emit('room:join', payload, (result) => {
            if (!result.ok)
                setError(result.error);
        });
    };
    const handleAction = (action) => {
        if (!roomId)
            return;
        socket.emit('game:action', { roomId, action });
    };
    const isHost = Boolean(game && playerId && game.hostPlayerId === playerId);
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { children: [_jsx("h1", { children: "Texas Hold'em Live" }), _jsx("p", { children: "Realtime browser poker room" })] }), !game ? (_jsxs("section", { className: "lobby-card", children: [_jsx("input", { placeholder: "Nickname", value: nickname, maxLength: 20, onChange: (event) => setNickname(event.target.value) }), _jsx("input", { placeholder: "Room code", value: joinCode, onChange: (event) => setJoinCode(event.target.value.toUpperCase()) }), _jsxs("div", { className: "lobby-actions", children: [_jsx("button", { onClick: handleCreate, disabled: !nickname.trim(), children: "Create Room" }), _jsx("button", { onClick: handleJoin, disabled: !nickname.trim() || !joinCode.trim(), children: "Join Room" })] }), error ? _jsx("div", { className: "error", children: error }) : null] })) : (_jsxs("section", { className: "table-layout", children: [_jsxs("div", { className: "table-area", children: [_jsxs("div", { className: "table-felt", children: [_jsx("div", { className: "community-row", children: game.communityCards.map((card, idx) => (_jsx(CardBadge, { card: card }, `${card.rank}-${card.suit}-${idx}`))) }), _jsxs("div", { className: "pot", children: ["Pot: ", game.totalPot] }), _jsxs("div", { className: "street", children: ["Street: ", game.street] }), _jsx("div", { className: "turn-timer", children: turnSeconds !== null ? `Turn: ${turnSeconds}s` : 'Waiting' }), _jsx("div", { className: "last-action", children: game.lastActionText ?? 'No recent action' })] }), _jsx("div", { className: "seats-grid", children: game.players.map((player) => (_jsx(Seat, { player: player, isMe: player.id === playerId, holeCards: me?.holeCards ?? [], canKick: Boolean(isHost && player.id !== playerId), onKick: () => socket.emit('room:kick', { roomId: game.roomId, targetPlayerId: player.id }) }, player.id))) })] }), _jsxs("aside", { children: [_jsx(ActionPanel, { view: view, roomId: game.roomId, onAction: handleAction }), _jsxs("div", { className: "panel", children: [_jsx("button", { onClick: () => navigator.clipboard.writeText(window.location.href), children: "Copy Invite Link" }), isHost ? (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => socket.emit('room:start', game.roomId), children: "Start Hand" }), _jsx("button", { onClick: () => socket.emit('room:reset', game.roomId), children: "Reset Table" })] })) : null] }), game.winners?.length ? (_jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-header", children: "Showdown" }), game.winners.map((winner) => {
                                        const player = game.players.find((p) => p.id === winner.playerId);
                                        return (_jsxs("div", { className: "panel-row", children: [player?.nickname ?? winner.playerId, ": +", winner.payout, " (", winner.rankLabel, ")"] }, winner.playerId));
                                    })] })) : null, error ? _jsx("div", { className: "error", children: error }) : null] })] }))] }));
}
