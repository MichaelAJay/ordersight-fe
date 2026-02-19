import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { HttpError } from '../../services/http';
import { getStore, type Store } from '../../services/stores';
import { Button } from '@/components/common/Button/Button';
import styles from './StoreShell.module.css';

type TabKey = 'orders' | 'menus' | 'team' | 'activity' | 'settings';

type TabConfig = {
  key: TabKey;
  label: string;
  adminOnly?: boolean;
};

const TAB_CONFIG: TabConfig[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'menus', label: 'Menus' },
  { key: 'team', label: 'Team' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings', adminOnly: true },
];

function normalizeRole(role: string | null | undefined) {
  if (!role) return null;
  return role.replace(/^org:/, '');
}

function isAdminRole(role: string | null | undefined) {
  if (!role) return false;
  return role === 'admin' || role === 'super_admin';
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function formatRole(role: string | null | undefined) {
  if (!role) return 'Role unavailable';
  const cleaned = role.replace(/_/g, ' ');
  return toTitleCase(cleaned);
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

export function StoreShell() {
  const { orgRole } = useAuth();
  const { storeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [storeState, setStoreState] = useState<{
    storeId: string | null;
    store: Store | null;
    error: string | null;
    noAccess: boolean;
  }>({
    storeId: null,
    store: null,
    error: null,
    noAccess: false,
  });

  const normalizedRole = normalizeRole(orgRole ?? null);
  const isAdmin = isAdminRole(normalizedRole);
  const roleLabel = formatRole(normalizedRole);

  const tabs = useMemo(() => {
    return TAB_CONFIG.filter((tab) => !tab.adminOnly || isAdmin);
  }, [isAdmin]);

  const selectedKey = useMemo<TabKey>(() => {
    if (!storeId) return 'orders';

    const basePath = `/stores/${storeId}`;
    const suffix = location.pathname.startsWith(basePath)
      ? location.pathname.slice(basePath.length)
      : '';
    const segment = suffix.startsWith('/') ? suffix.slice(1).split('/')[0] : '';

    if (
      segment === 'orders' ||
      segment === 'menus' ||
      segment === 'team' ||
      segment === 'activity' ||
      segment === 'settings'
    ) {
      return segment;
    }
    return 'orders';
  }, [location.pathname, storeId]);

  const activeKey: TabKey = tabs.some((tab) => tab.key === selectedKey) ? selectedKey : 'orders';
  const shouldRenderOutlet = tabs.some((tab) => tab.key === selectedKey);

  useEffect(() => {
    if (!storeId) return;

    let active = true;

    getStore(storeId)
      .then((data) => {
        if (!active) return;
        setStoreState({
          storeId,
          store: data,
          error: null,
          noAccess: false,
        });
      })
      .catch((err) => {
        if (!active) return;
        const httpError = err as HttpError | null;
        if (httpError?.status === 404) {
          setStoreState({
            storeId,
            store: null,
            error: null,
            noAccess: true,
          });
          return;
        }
        setStoreState({
          storeId,
          store: null,
          error: getErrorMessage(err, 'Unable to load this store.'),
          noAccess: false,
        });
      });

    return () => {
      active = false;
    };
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    if (!isAdmin && selectedKey === 'settings') {
      navigate(`/stores/${storeId}/orders`, { replace: true });
    }
  }, [isAdmin, navigate, selectedKey, storeId]);

  const handleTabChange = (key: string | number) => {
    if (!storeId) return;
    navigate(`/stores/${storeId}/${String(key)}`);
  };

  const handleBack = () => {
    navigate('/stores');
  };

  const hasCurrentStore = storeState.storeId === storeId;
  const store = hasCurrentStore ? storeState.store : null;
  const error = hasCurrentStore ? storeState.error : null;
  const noAccess = hasCurrentStore ? storeState.noAccess : false;
  const loading = Boolean(storeId && !hasCurrentStore);

  const headerName = store?.name ?? (loading ? 'Loading store...' : 'Store');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Button variant="outline" size="sm" onPress={handleBack}>
          Back to Stores
        </Button>
        <div className={styles.headerMain}>
          <h1 className={styles.storeName}>{headerName}</h1>
          <span className={styles.roleBadge}>{roleLabel}</span>
        </div>
      </header>

      {loading ? (
        <div className={styles.statePanel}>
          <p>Loading store...</p>
        </div>
      ) : null}

      {!loading && noAccess ? (
        <div className={styles.statePanel} role="alert">
          <h2 className={styles.stateTitle}>No access to this store</h2>
          <p className={styles.stateText}>You do not have access to this store.</p>
          <Button variant="outline" size="sm" onPress={handleBack}>
            Return to Stores
          </Button>
        </div>
      ) : null}

      {!loading && !noAccess && error ? (
        <div className={styles.statePanel} role="alert">
          <h2 className={styles.stateTitle}>Unable to load store</h2>
          <p className={styles.stateText}>{error}</p>
          <Button variant="outline" size="sm" onPress={handleBack}>
            Return to Stores
          </Button>
        </div>
      ) : null}

      {!loading && !noAccess && !error && activeKey ? (
        <Tabs selectedKey={activeKey} onSelectionChange={handleTabChange} className={styles.tabs}>
          <TabList className={styles.tabList} aria-label="Store navigation tabs">
            {tabs.map((tab) => (
              <Tab key={tab.key} id={tab.key} className={styles.tab}>
                {tab.label}
              </Tab>
            ))}
          </TabList>
          {tabs.map((tab) => (
            <TabPanel key={tab.key} id={tab.key} className={styles.tabPanel}>
              {shouldRenderOutlet && tab.key === selectedKey ? <Outlet /> : null}
            </TabPanel>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}
