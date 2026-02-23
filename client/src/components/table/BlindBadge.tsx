import styles from './Table.module.css';

interface Props {
  type: 'SB' | 'BB';
}

export function BlindBadge({ type }: Props) {
  return <span className={`${styles.blindBadge} ${type === 'BB' ? styles.bigBlind : styles.smallBlind}`}>{type}</span>;
}
