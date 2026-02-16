import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import styles from './MenuSetupPathPage.module.css';

export function MenuImportWizardPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <section className={styles.panel}>
        <h1 className={styles.title}>Import from a spreadsheet</h1>
        <p className={styles.lead}>
          This route is ready for the guided spreadsheet import flow. You can return to your menu at
          any time.
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
