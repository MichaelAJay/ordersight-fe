import { ReactNode } from 'react';
import styles from './StoreTabContent.module.css';

type StoreTabContentProps = {
  title: string;
  description: string;
  actions?: ReactNode;
};

export function StoreTabContent({ title, description, actions }: StoreTabContentProps) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
