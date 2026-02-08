import { Button } from '../Button/Button';
import styles from './TableBulkActions.module.css';

type BulkAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'secondary';
  isDisabled?: boolean;
};

type Props = {
  count: number;
  itemLabel: string;
  actions: BulkAction[];
  onClear?: () => void;
};

export function TableBulkActions({ count, itemLabel, actions, onClear }: Props) {
  const noun = count === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <div className={styles.toolbar} role="region" aria-label="Bulk actions">
      <div className={styles.count}>{`${count} ${noun} selected`}</div>
      <div className={styles.actions}>
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant={action.variant ?? 'outline'}
            size="sm"
            onPress={action.onPress}
            isDisabled={action.isDisabled}
          >
            {action.label}
          </Button>
        ))}
        {onClear ? (
          <Button type="button" variant="outline" size="sm" onPress={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
