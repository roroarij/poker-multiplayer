import { useMemo, useState } from 'react';
import type { ClientView, GameAction, LegalAction } from '@poker/shared';

interface Props {
  view: ClientView;
  roomId: string;
  onAction: (action: GameAction) => void;
}

function findAction(actions: LegalAction[], type: LegalAction['type']): LegalAction | undefined {
  return actions.find((action) => action.type === type);
}

export function ActionPanel({ view, roomId, onAction }: Props) {
  const me = view.me;
  const [amount, setAmount] = useState(0);

  const legal = me?.legalActions ?? [];

  const raiseAction = useMemo(() => findAction(legal, 'raise'), [legal]);
  const betAction = useMemo(() => findAction(legal, 'bet'), [legal]);
  const sizeRule = raiseAction ?? betAction;

  if (!me) {
    return <div className="panel">Join as a player to take actions.</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">Room {roomId}</div>
      <div className="panel-row">To call: {me.amountToCall}</div>
      <div className="panel-row">Min raise to: {me.minRaiseTo}</div>
      <div className="panel-actions">
        <button disabled={!findAction(legal, 'fold')} onClick={() => onAction({ type: 'fold' })}>
          Fold
        </button>
        <button disabled={!findAction(legal, 'check')} onClick={() => onAction({ type: 'check' })}>
          Check
        </button>
        <button disabled={!findAction(legal, 'call')} onClick={() => onAction({ type: 'call' })}>
          Call
        </button>
        <button disabled={!findAction(legal, 'all_in')} onClick={() => onAction({ type: 'all_in' })}>
          All-in
        </button>
      </div>
      <div className="panel-row amount-row">
        <input
          type="number"
          min={sizeRule?.minAmount ?? 0}
          max={sizeRule?.maxAmount ?? me.maxBet}
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
        />
        <button
          disabled={!betAction}
          onClick={() => onAction({ type: 'bet', amount: Math.floor(amount) })}
        >
          Bet
        </button>
        <button
          disabled={!raiseAction}
          onClick={() => onAction({ type: 'raise', amount: Math.floor(amount) })}
        >
          Raise
        </button>
      </div>
    </div>
  );
}
