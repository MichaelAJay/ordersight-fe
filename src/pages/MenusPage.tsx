import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { HttpError } from '@/services/http';
import { listMenus, type Menu } from '@/services/menus';
import { Button } from '@/components/common/Button/Button';
import { CreateMenuModal } from '@/components/menus/CreateMenuModal';
import { ImportMenusCsvModal } from '@/components/menus/ImportMenusCsvModal';
import styles from './MenusPage.module.css';

function normalizeRole(role: string | null | undefined) {
  if (!role) return null;
  return role.replace(/^org:/, '');
}

function isAdminRole(role: string | null | undefined) {
  if (!role) return false;
  return role === 'admin' || role === 'super_admin';
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

export function MenusPage() {
  const { isLoaded, orgRole } = useAuth();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSettledRequestKey, setLastSettledRequestKey] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const normalizedRole = normalizeRole(orgRole ?? null);
  const isAdmin = isAdminRole(normalizedRole);
  const requestKey = isLoaded && isAdmin ? String(refreshToken) : null;
  const loading = requestKey !== null && lastSettledRequestKey !== requestKey;

  useEffect(() => {
    if (!requestKey) {
      return;
    }

    let active = true;

    listMenus()
      .then((response) => {
        if (!active) return;
        setMenus(response ?? []);
        setError(null);
      })
      .catch((fetchError) => {
        if (!active) return;
        const httpError = fetchError as HttpError | null;
        if (httpError?.status === 401) {
          setError('Reconnect your session to load menus.');
          return;
        }
        if (httpError?.status === 403) {
          setError('You do not have permission to view menus.');
          return;
        }
        setError(getErrorMessage(fetchError, 'Unable to load menus.'));
      })
      .finally(() => {
        if (active) setLastSettledRequestKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [requestKey]);

  const summaryText = useMemo(() => {
    const total = menus.length;
    if (total === 0) return null;
    return `${total} menu${total === 1 ? '' : 's'}`;
  }, [menus.length]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Menus</h1>
          <p className={styles.subtitle}>Admin menu library for your organization.</p>
        </div>
        {isLoaded && isAdmin ? (
          <div className={styles.headerActions}>
            <Button variant="outline" size="sm" onPress={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button variant="primary" size="sm" onPress={() => setCreateOpen(true)}>
              Create Menu
            </Button>
          </div>
        ) : null}
      </header>

      {!isLoaded ? (
        <div className={styles.loadingState}>
          <p>Checking access...</p>
        </div>
      ) : null}

      {isLoaded && !isAdmin ? (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>Menu management is admin only</h2>
          <p className={styles.emptyText}>
            Store-level menus will be available from the Store page for non-admin users.
          </p>
        </div>
      ) : null}

      {isLoaded && isAdmin && loading ? (
        <div className={styles.loadingState}>
          <p>Loading menus...</p>
        </div>
      ) : null}

      {isLoaded && isAdmin && !loading && error ? (
        <div className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>Unable to load menus</h2>
          <p className={styles.errorText}>{error}</p>
          <Button variant="outline" size="sm" onPress={() => setRefreshToken((prev) => prev + 1)}>
            Retry
          </Button>
        </div>
      ) : null}

      {isLoaded && isAdmin && !loading && !error && summaryText ? (
        <div className={styles.summary}>
          <span className={styles.summaryText}>{summaryText}</span>
        </div>
      ) : null}

      {isLoaded && isAdmin && !loading && !error && menus.length === 0 ? (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>No menus yet</h2>
          <p className={styles.emptyText}>
            Create your first menu or import a CSV file to get started.
          </p>
          <div className={styles.emptyActions}>
            <Button variant="outline" onPress={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button variant="primary" onPress={() => setCreateOpen(true)}>
              Create Menu
            </Button>
          </div>
        </div>
      ) : null}

      {isLoaded && isAdmin && !loading && !error && menus.length > 0 ? (
        <div className={styles.menuGrid} aria-label="Menu list">
          {menus.map((menu) => (
            <article key={menu.id} className={styles.menuCard}>
              <h2 className={styles.menuName}>{menu.name}</h2>
              <p className={styles.menuMeta}>Menu ID: {menu.id}</p>
            </article>
          ))}
        </div>
      ) : null}

      <CreateMenuModal isOpen={createOpen} onOpenChange={setCreateOpen} />
      <ImportMenusCsvModal isOpen={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
