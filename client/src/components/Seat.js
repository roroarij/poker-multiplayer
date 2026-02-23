import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { CardBadge } from './CardBadge';
export function Seat({ player, isMe, holeCards, canKick, onKick }) {
    return (_jsxs("div", { className: `seat ${player.isTurn ? 'turn' : ''}`, style: { borderColor: player.color }, children: [_jsxs("div", { className: "seat-top", children: [_jsxs("div", { className: "seat-name", children: [player.nickname, player.isHost ? ' (Host)' : '', isMe ? ' (You)' : ''] }), _jsxs("div", { className: "seat-badges", children: [player.isDealer ? _jsx("span", { className: "badge", children: "D" }) : null, player.isSmallBlind ? _jsx("span", { className: "badge", children: "SB" }) : null, player.isBigBlind ? _jsx("span", { className: "badge", children: "BB" }) : null] })] }), _jsxs("div", { className: "seat-meta", children: [_jsxs("span", { children: [player.chips, " chips"] }), _jsx("span", { className: `status ${player.status}`, children: player.status })] }), _jsx("div", { className: "seat-cards", children: isMe
                    ? holeCards.map((card, idx) => _jsx(CardBadge, { card: card }, `${card.rank}-${card.suit}-${idx}`))
                    : [0, 1].map((n) => _jsx(CardBadge, { hidden: true }, n)) }), canKick ? (_jsx("button", { type: "button", className: "danger", onClick: onKick, children: "Remove" })) : null] }));
}
