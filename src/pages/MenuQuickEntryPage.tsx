import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import styles from './MenuSetupPathPage.module.css';

export function MenuQuickEntryPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <section className={styles.panel}>
        <h1 className={styles.title}>Quick-add items</h1>
        <p className={styles.lead}>
          This route is ready for the table-style quick-entry flow. You can return to your menu
          whenever you want.
        </p>
        <div className={styles.actions}>
          <Button type="button" onPress={() => navigate('/menus')}>
            Back to your menu
          </Button>
        </div>
      </section>
    </div>
  );
}
