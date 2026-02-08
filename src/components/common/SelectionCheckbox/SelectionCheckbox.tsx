import type { CheckboxProps } from 'react-aria-components';
import { Checkbox } from 'react-aria-components';
import styles from './SelectionCheckbox.module.css';

type Props = CheckboxProps & {
  label?: string;
};

export function SelectionCheckbox({ label, ...rest }: Props) {
  return (
    <Checkbox {...rest} className={styles.checkbox} aria-label={label}>
      {({ isIndeterminate }) => (
        <span className={styles.box} aria-hidden="true">
          <span className={styles.icon}>{isIndeterminate ? '-' : 'x'}</span>
        </span>
      )}
    </Checkbox>
  );
}
