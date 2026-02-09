import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Radio, RadioGroup, TextField } from 'react-aria-components';
import { HttpError } from '../services/http';
import {
  getMemberDetail,
  listMembers,
  type MemberStoreAssignment,
  type MemberWithUser,
} from '../services/membership';
import {
  listStores,
  listStoreOpenOrders,
  type Store,
  type StoreOpenOrdersMap,
} from '../services/stores';
import { Button } from '@/components/common/Button/Button';
import styles from './StoresPage.module.css';

type StatusFilter = 'active' | 'archived' | 'all';

type ViewerState = {
  role: string | null;
  memberId: string | null;
  assignments: MemberStoreAssignment[] | null;
  loading: boolean;
  error: string | null;
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const MEMBERS_PAGE_LIMIT = 200;
const MEMBER_LOOKUP_PAGE_LIMIT = 10;

function normalizeRole(role: string | null | undefined) {
  if (!role) return null;
  return role.replace(/^org:/, '');
}

function isAdminRole(role: string | null | undefined) {
  if (!role) return false;
  return role === 'admin' || role === 'super_admin';
}

function normalizeStatus(status?: string | null) {
  if (!status) return 'active';
  return status.toLowerCase();
}

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => (part?.[0] ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

async function findMemberByClerkId(clerkUserId: string): Promise<MemberWithUser | null> {
  let offset = 0;

  for (let page = 0; page < MEMBER_LOOKUP_PAGE_LIMIT; page += 1) {
    const response = await listMembers({ limit: MEMBERS_PAGE_LIMIT, offset });
    const match = response.members.find((member) => member.user.clerk_user_id === clerkUserId);
    if (match) return match;

    const total = response.pagination?.total ?? 0;
    offset += MEMBERS_PAGE_LIMIT;
    if (offset >= total) return null;
  }

  return null;
}

export function StoresPage() {
  const { userId: clerkUserId, orgRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [openOrders, setOpenOrders] = useState<StoreOpenOrdersMap>({});
  const [openOrdersStatus, setOpenOrdersStatus] = useState<'idle' | 'loading' | 'loaded' | 'down'>(
    'idle',
  );

  const [viewer, setViewer] = useState<ViewerState>({
    role: null,
    memberId: null,
    assignments: null,
    loading: true,
    error: null,
  });

  const [searchValue, setSearchValue] = useState('');
  const didAutoEnter = useRef(false);

  const normalizedClerkRole = normalizeRole(orgRole ?? null);
  const effectiveRole = viewer.role ?? normalizedClerkRole;
  const isAdmin = isAdminRole(effectiveRole);

  const rawStatus = searchParams.get('status') ?? 'active';
  const statusFilter: StatusFilter = isAdmin
    ? rawStatus === 'archived' || rawStatus === 'all' || rawStatus === 'active'
      ? rawStatus
      : 'active'
    : 'all';

  useEffect(() => {
    let active = true;
    setStoresLoading(true);
    setStoresError(null);

    listStores()
      .then((data) => {
        if (!active) return;
        setStores(data ?? []);
      })
      .catch((error) => {
        if (!active) return;
        setStoresError(getErrorMessage(error, 'Unable to load stores.'));
      })
      .finally(() => {
        if (active) setStoresLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshToken]);

  useEffect(() => {
    let active = true;
    setOpenOrdersStatus('loading');

    listStoreOpenOrders()
      .then((data) => {
        if (!active) return;
        setOpenOrders(data ?? {});
        setOpenOrdersStatus('loaded');
      })
      .catch((error) => {
        if (!active) return;
        const httpError = error as HttpError | null;
        if (httpError?.status === 501) {
          setOpenOrdersStatus('down');
          return;
        }
        setOpenOrdersStatus('down');
      });

    return () => {
      active = false;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (!clerkUserId) return;

    let active = true;
    setViewer((prev) => ({ ...prev, loading: true, error: null }));

    const loadViewer = async () => {
      try {
        const member = await findMemberByClerkId(clerkUserId);
        if (!active) return;
        if (!member) {
          setViewer({
            role: null,
            memberId: null,
            assignments: null,
            loading: false,
            error: 'Unable to resolve your membership record.',
          });
          return;
        }

        const detail = await getMemberDetail(member.membership.user_id);
        if (!active) return;

        setViewer({
          role: member.membership.role ?? null,
          memberId: member.membership.user_id,
          assignments: detail.store_assignments ?? [],
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!active) return;
        setViewer((prev) => ({
          ...prev,
          loading: false,
          assignments: null,
          error: getErrorMessage(error, 'Unable to load your store access.'),
        }));
      }
    };

    loadViewer();

    return () => {
      active = false;
    };
  }, [clerkUserId, refreshToken]);

  useEffect(() => {
    if (didAutoEnter.current) return;
    if (storesLoading) return;
    if (!isAdmin && viewer.loading) return;
    if (isAdmin) return;
    if (!viewer.assignments) return;

    const assignmentIds = new Set(viewer.assignments.map((assignment) => assignment.store_id));
    const accessibleStores = stores.filter((store) => assignmentIds.has(store.id));

    if (accessibleStores.length === 1) {
      didAutoEnter.current = true;
      navigate(`/stores/${accessibleStores[0]?.id}`, { replace: true });
    }
  }, [isAdmin, navigate, stores, storesLoading, viewer.assignments, viewer.loading]);

  const assignmentIds = useMemo(() => {
    return new Set(viewer.assignments?.map((assignment) => assignment.store_id) ?? []);
  }, [viewer.assignments]);

  const accessibleStores = useMemo(() => {
    if (isAdmin) return stores;
    if (!viewer.assignments) return [];
    return stores.filter((store) => assignmentIds.has(store.id));
  }, [assignmentIds, isAdmin, stores, viewer.assignments]);

  const statusFilteredStores = useMemo(() => {
    if (!isAdmin || statusFilter === 'all') return accessibleStores;

    return accessibleStores.filter((store) => {
      const status = normalizeStatus(store.status);
      if (statusFilter === 'archived') return status === 'archived';
      return status !== 'archived';
    });
  }, [accessibleStores, isAdmin, statusFilter]);

  const filteredStores = useMemo(() => {
    if (!searchValue.trim()) return statusFilteredStores;
    const query = searchValue.trim().toLowerCase();

    return statusFilteredStores.filter((store) => {
      const searchable = [store.name, store.location, store.descriptor]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [searchValue, statusFilteredStores]);

  const summaryText = useMemo(() => {
    const total = accessibleStores.length;
    const visible = filteredStores.length;
    if (total === 0) return null;
    if (visible === total) {
      return `${total} store${total === 1 ? '' : 's'}`;
    }
    return `Showing ${visible} of ${total} stores`;
  }, [accessibleStores.length, filteredStores.length]);

  const showLoading = storesLoading || (!isAdmin && viewer.loading);
  const showStoresError = Boolean(storesError);
  const showAccessError = !isAdmin && Boolean(viewer.error);
  const noStores =
    !showLoading && !showStoresError && !showAccessError && accessibleStores.length === 0;
  const noMatches =
    !showLoading &&
    !showStoresError &&
    !showAccessError &&
    accessibleStores.length > 0 &&
    filteredStores.length === 0;

  const handleStatusChange = (value: StatusFilter) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete('status');
    } else {
      next.set('status', value);
    }
    setSearchParams(next, { replace: true });
  };

  const handleRetry = () => {
    setRefreshToken((prev) => prev + 1);
  };

  const renderOpenOrders = (storeId: string) => {
    if (openOrdersStatus !== 'loaded') return '--';
    const value = openOrders[storeId];
    return typeof value === 'number' ? String(value) : '--';
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Stores</h1>
          <p className={styles.subtitle}>Choose where you want to operate today.</p>
        </div>
      </header>

      <div className={styles.controls}>
        <TextField
          aria-label="Search stores"
          value={searchValue}
          onChange={setSearchValue}
          className={styles.searchField}
        >
          <Input className={styles.searchInput} placeholder="Search by name or location" />
        </TextField>

        {isAdmin ? (
          <RadioGroup
            aria-label="Filter stores by status"
            value={statusFilter}
            onChange={(value) => handleStatusChange(value as StatusFilter)}
            className={styles.filterGroup}
          >
            {STATUS_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value} className={styles.filterOption}>
                {option.label}
              </Radio>
            ))}
          </RadioGroup>
        ) : null}
      </div>

      {summaryText ? (
        <div className={styles.summary}>
          <span className={styles.summaryText}>{summaryText}</span>
        </div>
      ) : null}

      {showStoresError ? (
        <div className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>Unable to load stores</h2>
          <p className={styles.errorText}>{storesError}</p>
          <Button variant="outline" size="sm" onPress={handleRetry}>
            Retry
          </Button>
        </div>
      ) : null}

      {showAccessError ? (
        <div className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>We could not verify your store access</h2>
          <p className={styles.errorText}>{viewer.error}</p>
          <Button variant="outline" size="sm" onPress={handleRetry}>
            Retry
          </Button>
        </div>
      ) : null}

      {showLoading ? (
        <div className={styles.loadingState}>
          <p>Loading stores...</p>
        </div>
      ) : null}

      {noStores ? (
        <div className={styles.emptyState}>
          {isAdmin ? (
            <>
              <h2 className={styles.emptyTitle}>No stores yet</h2>
              <p className={styles.emptyText}>
                Create your first store to start managing orders and teams.
              </p>
              <div className={styles.emptyActions}>
                <Button variant="primary" isDisabled>
                  Create store (coming soon)
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className={styles.emptyTitle}>You don&apos;t have access to any stores yet</h2>
              <p className={styles.emptyText}>Ask an admin to add you to a store.</p>
            </>
          )}
        </div>
      ) : null}

      {noMatches ? (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>No stores match your search</h2>
          <p className={styles.emptyText}>Try a different name or location.</p>
        </div>
      ) : null}

      {!showLoading && !showStoresError && !showAccessError && filteredStores.length > 0 ? (
        <div className={styles.storeList}>
          {filteredStores.map((store) => {
            const status = normalizeStatus(store.status);
            const statusLabel = formatStatus(status);
            const location = [store.location, store.descriptor].filter(Boolean).join(' / ');

            return (
              <Button
                key={store.id}
                className={styles.storeCard}
                onPress={() => navigate(`/stores/${store.id}`)}
                aria-label={`Enter ${store.name}`}
              >
                <div className={styles.storeCardHeader}>
                  <div className={styles.storeTitle}>
                    <span className={styles.storeName}>{store.name}</span>
                    <span className={styles.storeStatus} data-status={status}>
                      {statusLabel}
                    </span>
                  </div>
                  {location ? <span className={styles.storeMeta}>{location}</span> : null}
                </div>
                <div className={styles.storeStats}>
                  <div className={styles.storeStat}>
                    <span className={styles.statLabel}>Open orders</span>
                    <span className={styles.statValue}>{renderOpenOrders(store.id)}</span>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
