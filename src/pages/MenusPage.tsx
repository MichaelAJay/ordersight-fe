import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import { HttpError } from '@/services/http';
import { listCategories, listMenuItems, type MenuItem, type PriceUnit } from '@/services/menuItems';
import styles from './MenusPage.module.css';

const CATALOG_LIMIT = 100;

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function formatPrice(cents: number | null, unit: PriceUnit | null): string {
  if (typeof cents !== 'number') {
    return 'Set later';
  }

  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

  if (unit === 'per_person') {
    return `${amount} / person`;
  }
  if (unit === 'per_unit') {
    return `${amount} / unit`;
  }
  return amount;
}

function getCategoryMap(items: MenuItem[], categories: { id: string; name: string }[]) {
  const categoryMap = new Map<string, string>();
  for (const category of categories) {
    categoryMap.set(category.id, category.name);
  }

  const byItem = new Map<string, string>();
  for (const item of items) {
    if (!item.category_id) {
      continue;
    }
    const categoryName = categoryMap.get(item.category_id);
    if (categoryName) {
      byItem.set(item.id, categoryName);
    }
  }

  return byItem;
}

export function MenusPage() {
  const navigate = useNavigate();
  const { isLoaded } = useAuth();
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [hasSettledFetch, setHasSettledFetch] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [total, setTotal] = useState(0);
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const loading = isLoaded && !hasSettledFetch;

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    let active = true;

    Promise.allSettled([listMenuItems({ limit: CATALOG_LIMIT, offset: 0 }), listCategories()])
      .then((results) => {
        if (!active) return;

        const catalogResult = results[0];
        if (catalogResult.status !== 'fulfilled') {
          throw catalogResult.reason;
        }

        const categories = results[1].status === 'fulfilled' ? results[1].value : [];

        setItems(catalogResult.value.items);
        setTotal(catalogResult.value.total);
        setCategoryMap(getCategoryMap(catalogResult.value.items, categories));
        setError(null);
      })
      .catch((fetchError) => {
        if (!active) return;
        const httpError = fetchError as HttpError | null;
        if (httpError?.status === 401) {
          setError('Reconnect your session to load your menu.');
          return;
        }
        if (httpError?.status === 403) {
          setError('You do not have permission to view this menu.');
          return;
        }
        setError(getErrorMessage(fetchError, 'Unable to load your menu.'));
      })
      .finally(() => {
        if (active) {
          setHasSettledFetch(true);
        }
      });

    return () => {
      active = false;
    };
  }, [isLoaded, refreshSeed]);

  const hasItems = total > 0;

  const subtitle = useMemo(() => {
    if (hasItems) {
      return 'Everything you have already added. Keep importing or quick-adding anytime.';
    }
    return 'Choose the fastest way to bring your menu into Ordersight.';
  }, [hasItems]);

  const handleRetry = () => {
    setHasSettledFetch(false);
    setRefreshSeed((seed) => seed + 1);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Your menu</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {isLoaded && !loading && !error && hasItems ? (
          <div className={styles.toolbar}>
            <Button type="button" size="sm" onPress={() => navigate('/menus/import')}>
              Import from spreadsheet
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onPress={() => navigate('/menus/quick-entry')}
            >
              Quick-add items
            </Button>
          </div>
        ) : null}
      </header>

      {!isLoaded ? (
        <section className={styles.loadingState}>
          <p>Checking access...</p>
        </section>
      ) : null}

      {isLoaded && loading ? (
        <section className={styles.loadingState}>
          <p>Loading your menu...</p>
        </section>
      ) : null}

      {isLoaded && !loading && error ? (
        <section className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>Unable to load your menu</h2>
          <p className={styles.errorText}>{error}</p>
          <div className={styles.errorActions}>
            <Button type="button" variant="outline" size="sm" onPress={handleRetry}>
              Retry
            </Button>
          </div>
        </section>
      ) : null}

      {isLoaded && !loading && !error && !hasItems ? (
        <section className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>Let&apos;s get your menu set up</h2>
          <p className={styles.emptyText}>
            You can start with a spreadsheet or type things in manually. Either way, we&apos;ll help
            you move quickly.
          </p>

          <div className={styles.pathGrid}>
            <article className={styles.pathCard}>
              <h3 className={styles.pathTitle}>Import from a spreadsheet</h3>
              <p className={styles.pathText}>
                Upload a CSV or Excel export of your menu and we&apos;ll walk you through getting it
                into the system.
              </p>
              <Button type="button" onPress={() => navigate('/menus/import')}>
                Start import
              </Button>
            </article>

            <article className={styles.pathCard}>
              <h3 className={styles.pathTitle}>Enter items manually</h3>
              <p className={styles.pathText}>
                Add your items one at a time or use our quick-entry table.
              </p>
              <Button
                type="button"
                variant="outline"
                onPress={() => navigate('/menus/quick-entry')}
              >
                Open quick entry
              </Button>
            </article>
          </div>
        </section>
      ) : null}

      {isLoaded && !loading && !error && hasItems ? (
        <section className={styles.catalogPanel}>
          <p className={styles.summary}>
            {total === 1 ? '1 item in your menu' : `${total} items in your menu`}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <p className={styles.itemName}>{item.name}</p>
                      {item.description ? (
                        <p className={styles.itemDescription}>{item.description}</p>
                      ) : null}
                    </td>
                    <td>{categoryMap.get(item.id) ?? 'Uncategorized'}</td>
                    <td>{formatPrice(item.base_price, item.price_unit)}</td>
                    <td>
                      <span className={styles.statusBadge} data-active={item.is_active}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
