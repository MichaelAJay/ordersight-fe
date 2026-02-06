import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { Button as AriaButton, type ButtonProps } from 'react-aria-components';
import styles from './Button.module.css';

const button = cva(styles.btn, {
  variants: {
    variant: { primary: styles.primary, secondary: styles.secondary, outline: styles.outline },
    size: { sm: styles.sm, md: styles.md, lg: styles.lg },
    block: { true: styles.block },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

type Props = ButtonProps & VariantProps<typeof button>;

export function Button({ className, variant, size, block, ...rest }: Props) {
  return <AriaButton {...rest} className={clsx(button({ variant, size, block }), className)} />;
}
