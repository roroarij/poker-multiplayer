import { useMemo, useState } from 'react';
import type { ClientView, GameAction, LegalAction } from '@poker/shared';
import { BetSlider } from './BetSlider';
import styles from './Table.module.css';

interface Props {
  view: ClientView;
  onAction: (action: GameAction) => void;
  waitingForName: string | null;
}

function byType(legalActions: LegalAction[], type: LegalAction['type']): LegalAction | undefined {
  return legalActions.find((action) => action.type === type);
}

export function ActionPanel({ view, onAction, waitingForName }: Props) {
  const me = view.me;
  const game = view.game;
  const [sliderOpen, setSliderOpen] = useState(false);

  const legalActions = me?.legalActions ?? [];

  const fold = byType(legalActions, 'fold');
  const call = byType(legalActions, 'call');
  const check = byType(legalActions, 'check');
  const raise = byType(legalActions, 'raise');
  const bet = byType(legalActions, 'bet');
  const allIn = byType(legalActions, 'all_in');
  const sizingAction = raise ?? bet;

  const primaryLabel = useMemo(() => {
    if (call) return `Call ${me?.amountToCall ?? 0}`;
    if (check) return 'Check';
    return 'Waiting';
  }, [call, check, me?.amountToCall]);

  const onPrimary = () => {
    if (call) {
      onAction({ type: 'call' });
      return;
    }
    if (check) {
      onAction({ type: 'check' });
    }
  };

  if (!me) {
    return <div className={styles.actionPanelGhost}>Join as a player to take actions.</div>;
  }

  if (!me.canAct) {
    return <div className={styles.actionPanelGhost}>Waiting for {waitingForName ?? 'next player'}...</div>;
  }

  return (
    <div className={styles.actionPanel}>
      <div className={styles.actionRow}>
        <button className={styles.primaryAction} disabled={!call && !check} onClick={onPrimary}>
          {primaryLabel}
        </button>
        <button disabled={!fold} onClick={() => onAction({ type: 'fold' })}>Fold</button>
      </div>
      <div className={styles.actionRow}>
        <button disabled={!sizingAction} onClick={() => setSliderOpen((open) => !open)}>
          {raise ? 'Raise' : 'Bet'}
        </button>
        <button disabled={!allIn} onClick={() => onAction({ type: 'all_in' })}>All-in</button>
      </div>

      {sliderOpen && sizingAction ? (
        <BetSlider
          action={sizingAction}
          game={game}
          onCancel={() => setSliderOpen(false)}
          onSubmit={(amount) => {
            if (sizingAction.type === 'raise') {
              onAction({ type: 'raise', amount });
            } else {
              onAction({ type: 'bet', amount });
            }
            setSliderOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
