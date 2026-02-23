import { jsx as _jsx } from "react/jsx-runtime";
import { cardLabel } from '../lib/format';
export function CardBadge({ card, hidden }) {
    return (_jsx("div", { className: `card-badge ${hidden ? 'hidden' : ''}`, children: hidden ? '🂠' : card ? cardLabel(card) : '' }));
}
