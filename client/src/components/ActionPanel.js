import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
function findAction(actions, type) {
    return actions.find((action) => action.type === type);
}
export function ActionPanel({ view, roomId, onAction }) {
    const me = view.me;
    const [amount, setAmount] = useState(0);
    const legal = me?.legalActions ?? [];
    const raiseAction = useMemo(() => findAction(legal, 'raise'), [legal]);
    const betAction = useMemo(() => findAction(legal, 'bet'), [legal]);
    const sizeRule = raiseAction ?? betAction;
    if (!me) {
        return _jsx("div", { className: "panel", children: "Join as a player to take actions." });
    }
    return (_jsxs("div", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: ["Room ", roomId] }), _jsxs("div", { className: "panel-row", children: ["To call: ", me.amountToCall] }), _jsxs("div", { className: "panel-row", children: ["Min raise to: ", me.minRaiseTo] }), _jsxs("div", { className: "panel-actions", children: [_jsx("button", { disabled: !findAction(legal, 'fold'), onClick: () => onAction({ type: 'fold' }), children: "Fold" }), _jsx("button", { disabled: !findAction(legal, 'check'), onClick: () => onAction({ type: 'check' }), children: "Check" }), _jsx("button", { disabled: !findAction(legal, 'call'), onClick: () => onAction({ type: 'call' }), children: "Call" }), _jsx("button", { disabled: !findAction(legal, 'all_in'), onClick: () => onAction({ type: 'all_in' }), children: "All-in" })] }), _jsxs("div", { className: "panel-row amount-row", children: [_jsx("input", { type: "number", min: sizeRule?.minAmount ?? 0, max: sizeRule?.maxAmount ?? me.maxBet, value: amount, onChange: (event) => setAmount(Number(event.target.value)) }), _jsx("button", { disabled: !betAction, onClick: () => onAction({ type: 'bet', amount: Math.floor(amount) }), children: "Bet" }), _jsx("button", { disabled: !raiseAction, onClick: () => onAction({ type: 'raise', amount: Math.floor(amount) }), children: "Raise" })] })] }));
}
