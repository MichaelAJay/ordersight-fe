import { useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { Button } from '@/components/common/Button/Button';
import styles from './SessionReconnectScreen.module.css';

const SIGN_IN_URL = import.meta.env.VITE_CLERK_SIGN_IN_URL ?? '/sign-in';

export function SessionReconnectScreen() {
  const clerk = useClerk();
  const [busyAction, setBusyAction] = useState<'reconnect' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReconnect = async () => {
    if (busyAction) return;
    setBusyAction('reconnect');
    setError(null);
    try {
      await clerk.signOut({ redirectUrl: SIGN_IN_URL });
    } catch {
      setError('We could not reconnect your session. Please try again.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignOut = async () => {
    if (busyAction) return;
    setBusyAction('signout');
    setError(null);
    try {
      await clerk.signOut();
    } catch {
      setError('We could not sign you out. Please try again.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.panel} role="alert" aria-live="assertive">
        <p className={styles.eyebrow}>Session check</p>
        <h1 className={styles.title}>We need to reconnect your session</h1>
        <p className={styles.description}>
          Your sign-in token no longer matches what the server expects. Reconnect to continue.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <Button
            variant="primary"
            onPress={handleReconnect}
            isDisabled={busyAction !== null}
            className={styles.actionButton}
          >
            Reconnect
          </Button>
          <Button
            variant="secondary"
            onPress={handleSignOut}
            isDisabled={busyAction !== null}
            className={styles.actionButton}
          >
            Sign out
          </Button>
        </div>
      </div>
    </section>
  );
}
