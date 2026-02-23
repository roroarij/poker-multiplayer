import styles from './Table.module.css';

interface Props {
  entries: string[];
}

export function ActionLog({ entries }: Props) {
  return (
    <div className={styles.actionLog}>
      <div className={styles.logTitle}>Action Log</div>
      {entries.length ? (
        entries.map((entry, idx) => (
          <div key={`${entry}-${idx}`} className={styles.logLine}>
            {entry}
          </div>
        ))
      ) : (
        <div className={styles.logLine}>No actions yet.</div>
      )}
    </div>
  );
}
