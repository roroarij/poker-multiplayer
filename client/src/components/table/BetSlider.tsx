import { useEffect, useMemo, useState } from 'react';
import type { LegalAction, PublicGameState } from '@poker/shared';
import styles from './Table.module.css';

interface Props {
  action: LegalAction;
  game: PublicGameState;
  onSubmit: (amount: number) => void;
  onCancel: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function BetSlider({ action, game, onSubmit, onCancel }: Props) {
  const minAmount = action.minAmount ?? game.blindBig;
  const maxAmount = action.maxAmount ?? minAmount;
  const [amount, setAmount] = useState(minAmount);

  useEffect(() => {
    setAmount(minAmount);
  }, [minAmount]);

  const postflopButtons = useMemo(() => {
    const pot = Math.max(game.totalPot, game.blindBig);
    return [
      { label: '1/2 Pot', amount: pot * 0.5 },
      { label: '2/3 Pot', amount: pot * (2 / 3) },
      { label: 'Pot', amount: pot },
    ];
  }, [game.totalPot, game.blindBig]);

  const preflopButtons = useMemo(
    () => [
      { label: '2x BB', amount: game.blindBig * 2 },
      { label: '2.5x BB', amount: game.blindBig * 2.5 },
      { label: '3x BB', amount: game.blindBig * 3 },
    ],
    [game.blindBig],
  );

  return (
    <div className={styles.sliderWrap}>
      <div className={styles.sliderTop}>
        <span>{action.type === 'raise' ? 'Raise To' : 'Bet'}: {amount}</span>
        <button onClick={onCancel}>Close</button>
      </div>
      <input
        type="range"
        min={minAmount}
        max={maxAmount}
        value={amount}
        onChange={(event) => setAmount(clamp(Number(event.target.value), minAmount, maxAmount))}
      />
      <input
        type="number"
        min={minAmount}
        max={maxAmount}
        value={amount}
        onChange={(event) => setAmount(clamp(Number(event.target.value), minAmount, maxAmount))}
      />
      <div className={styles.quickBetGrid}>
        {(game.street === 'preflop' ? preflopButtons : postflopButtons).map((shortcut) => (
          <button
            key={shortcut.label}
            onClick={() => setAmount(clamp(shortcut.amount, minAmount, maxAmount))}
          >
            {shortcut.label}
          </button>
        ))}
      </div>
      <button className={styles.primaryAction} onClick={() => onSubmit(amount)}>
        Confirm {action.type === 'raise' ? 'Raise' : 'Bet'}
      </button>
    </div>
  );
}
