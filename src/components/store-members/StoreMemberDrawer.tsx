import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components';
import { HttpError } from '../../services/http';
import {
  getStoreMemberDetail,
  listStoreMemberOrders,
  type MemberStoreAssignment,
  type MemberWithUser,
} from '../../services/membership';
import { MemberNotificationsTab } from '../members/MemberNotificationsTab';
import { MemberProfileBase } from '../members/MemberProfileBase';
import { MemberRoleBadge } from '../members/MemberRoleBadge';
import { MemberStatusBadge } from '../members/MemberStatusBadge';
import { formatDateTime } from '../../utils/date';
import { Button } from '../common/Button/Button';
import profileStyles from '../members/MemberProfileBase.module.css';
import drawerStyles from '../members/MemberDrawer.module.css';
import styles from './StoreMemberDrawer.module.css';

type StoreMemberDrawerProps = {
  isOpen: boolean;
  member: MemberWithUser | null;
  storeId?: string | null;
  onClose: () => void;
  canSendNotification?: boolean;
  onSendNotification?: (member: MemberWithUser) => void;
};

type NormalizedOrder = {
  key: string;
  label: string;
  statusLabel: string;
  totalLabel: string;
  placedAtLabel: string;
};

function getDisplayName(member: MemberWithUser) {
  const first = member.user.first_name?.trim();
  const last = member.user.last_name?.trim();
  const fullName = [first, last].filter(Boolean).join(' ');
  if (fullName) return fullName;
  if (member.user.email) return member.user.email;
  return 'Unnamed member';
}

function getInitials(member: MemberWithUser) {
  const first = member.user.first_name?.trim()?.[0];
  const last = member.user.last_name?.trim()?.[0];
  const email = member.user.email?.trim()?.[0];
  const initials = [first, last].filter(Boolean).join('');
  if (initials) return initials.toUpperCase();
  if (email) return email.toUpperCase();
  return '?';
}

function normalizeRole(role?: string | null) {
  if (!role) return null;
  return role.replace(/^org:/, '').toLowerCase();
}

function formatStatusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function isMemberWithUser(value: unknown): value is MemberWithUser {
  if (!value || typeof value !== 'object') return false;
  const record = value as MemberWithUser;
  return Boolean(record.membership && record.user && typeof record.membership.user_id === 'string');
}

function getAssignmentsForStore(
  assignments: unknown,
  storeId: string,
): MemberStoreAssignment | null {
  if (!Array.isArray(assignments)) return null;
  for (const entry of assignments) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as MemberStoreAssignment & { storeId?: string; id?: string };
    const assignmentStoreId = record.store_id ?? record.storeId ?? record.id;
    if (assignmentStoreId === storeId) return record;
  }
  return null;
}

function extractAssignedAt(detail: unknown, storeId?: string | null): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;
  const direct = record['assigned_at'];
  if (typeof direct === 'string') return direct;

  const assignment = record['assignment'] as Record<string, unknown> | undefined;
  const assignmentDate = assignment?.['assigned_at'];
  if (typeof assignmentDate === 'string') return assignmentDate;

  const storeAssignment = record['store_assignment'] as Record<string, unknown> | undefined;
  const storeAssignmentDate = storeAssignment?.['assigned_at'];
  if (typeof storeAssignmentDate === 'string') return storeAssignmentDate;

  if (!storeId) return null;
  const assignments = record['store_assignments'] ?? record['assignments'];
  const assignmentRecord = getAssignmentsForStore(assignments, storeId);
  if (assignmentRecord?.assigned_at) return assignmentRecord.assigned_at;

  const memberRecord = record['member'] as Record<string, unknown> | undefined;
  const memberAssignments = memberRecord?.['store_assignments'];
  const memberAssignment = getAssignmentsForStore(memberAssignments, storeId);
  return memberAssignment?.assigned_at ?? null;
}

function parseCurrency(value: number, currency = 'USD') {
  const normalized = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function normalizeOrder(item: unknown, fallbackKey: string): NormalizedOrder | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;

  const idValue =
    record['id'] ??
    record['order_id'] ??
    record['orderId'] ??
    record['order_number'] ??
    record['number'] ??
    record['reference'];
  const key = typeof idValue === 'string' && idValue.trim() ? idValue : fallbackKey;

  const labelValue =
    record['order_number'] ?? record['number'] ?? record['reference'] ?? record['id'] ?? 'Order';
  const label = typeof labelValue === 'string' && labelValue.trim() ? labelValue : 'Order';

  const statusValue = record['status'] ?? record['state'] ?? record['order_status'];
  const statusLabel = typeof statusValue === 'string' ? formatStatusLabel(statusValue) : 'Unknown';

  const currency = typeof record['currency'] === 'string' ? record['currency'] : 'USD';

  const centsValue = record['total_cents'] ?? record['totalCents'];
  const totalValue = record['total'] ?? record['total_amount'] ?? record['amount'];
  let totalLabel = '--';
  if (typeof centsValue === 'number') {
    totalLabel = parseCurrency(centsValue / 100, currency);
  } else if (typeof totalValue === 'number') {
    totalLabel = parseCurrency(totalValue, currency);
  } else if (typeof totalValue === 'string' && totalValue.trim()) {
    totalLabel = totalValue;
  }

  const timestamp =
    record['placed_at'] ??
    record['created_at'] ??
    record['submitted_at'] ??
    record['updated_at'] ??
    record['completed_at'];
  const placedAtLabel = typeof timestamp === 'string' ? formatDateTime(timestamp) : '--';

  return {
    key,
    label,
    statusLabel,
    totalLabel,
    placedAtLabel,
  };
}

function normalizeOrdersResponse(data: unknown): NormalizedOrder[] {
  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidate = record['orders'] ?? record['data'] ?? record['items'] ?? record['results'];
    if (Array.isArray(candidate)) {
      items = candidate;
    }
  }

  return items
    .map((item, index) => normalizeOrder(item, `order-${index}`))
    .filter((order): order is NormalizedOrder => Boolean(order));
}

export function StoreMemberDrawer({
  isOpen,
  member,
  storeId,
  onClose,
  canSendNotification = false,
  onSendNotification,
}: StoreMemberDrawerProps) {
  const titleId = useId();
  const detailRequestRef = useRef(0);
  const ordersRequestRef = useRef(0);

  const [detailState, setDetailState] = useState<{
    key: string | null;
    member: MemberWithUser | null;
    assignedAt: string | null;
    error: string | null;
  }>({
    key: null,
    member: null,
    assignedAt: null,
    error: null,
  });

  const [ordersState, setOrdersState] = useState<{
    key: string | null;
    orders: NormalizedOrder[];
    error: string | null;
  }>({
    key: null,
    orders: [],
    error: null,
  });
  const [ordersRefreshToken, setOrdersRefreshToken] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const overlayState = isOpen ? 'open' : 'closed';

  const detailKey = isOpen && storeId && member ? `${storeId}:${member.membership.user_id}` : null;

  useEffect(() => {
    if (!detailKey || !storeId || !member) {
      return;
    }

    const requestId = (detailRequestRef.current += 1);

    getStoreMemberDetail(storeId, member.membership.user_id)
      .then((data) => {
        if (detailRequestRef.current !== requestId) return;
        const record = data as Record<string, unknown>;
        const candidate = record?.['member'];
        const detailMember = isMemberWithUser(data)
          ? data
          : isMemberWithUser(candidate)
            ? candidate
            : null;
        setDetailState({
          key: detailKey,
          member: detailMember,
          assignedAt: extractAssignedAt(data, storeId),
          error: null,
        });
      })
      .catch((error) => {
        if (detailRequestRef.current !== requestId) return;
        setDetailState({
          key: detailKey,
          member: null,
          assignedAt: null,
          error: getErrorMessage(error, 'Unable to load store member details.'),
        });
      });
  }, [detailKey, member, storeId]);

  useEffect(() => {
    if (!detailKey || !storeId || !member) {
      return;
    }

    const requestId = (ordersRequestRef.current += 1);

    listStoreMemberOrders(storeId, member.membership.user_id)
      .then((data) => {
        if (ordersRequestRef.current !== requestId) return;
        setOrdersState({
          key: detailKey,
          orders: normalizeOrdersResponse(data),
          error: null,
        });
      })
      .catch((error) => {
        if (ordersRequestRef.current !== requestId) return;
        setOrdersState({
          key: detailKey,
          orders: [],
          error: getErrorMessage(error, 'Unable to load store orders.'),
        });
      });
  }, [detailKey, member, ordersRefreshToken, storeId]);

  const refreshOrders = useCallback(() => {
    setOrdersRefreshToken((prev) => prev + 1);
  }, []);

  if (!member) return null;

  const detailMember = detailState.key === detailKey ? detailState.member : null;
  const detailError = detailState.key === detailKey ? detailState.error : null;
  const detailAssignedAt = detailState.key === detailKey ? detailState.assignedAt : null;

  const displayMember = detailMember ?? member;
  const displayName = getDisplayName(displayMember);
  const memberSinceOverride = detailAssignedAt ?? extractAssignedAt(displayMember, storeId);
  const role = normalizeRole(displayMember.membership.role);
  const avatarUrl = displayMember.user.image_url ?? null;

  const showActions = canSendNotification && Boolean(onSendNotification);

  const orders = ordersState.key === detailKey ? ordersState.orders : [];
  const ordersError = ordersState.key === detailKey ? ordersState.error : null;
  const ordersLoading = Boolean(detailKey) && ordersState.key !== detailKey;

  const ordersCountLabel =
    orders.length > 0 ? `${orders.length} order${orders.length === 1 ? '' : 's'}` : null;

  return (
    <div
      className={drawerStyles.overlay}
      data-state={overlayState}
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <section
        className={drawerStyles.drawer}
        data-state={overlayState}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={drawerStyles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <header className={drawerStyles.header}>
            <div className={drawerStyles.identity}>
              <div className={drawerStyles.avatar} aria-hidden="true">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className={drawerStyles.avatarImage} loading="lazy" />
                ) : (
                  getInitials(displayMember)
                )}
              </div>
              <div>
                <h2 id={titleId} className={drawerStyles.title}>
                  {displayName}
                </h2>
                <p className={drawerStyles.subtitle}>Store member details</p>
                <div className={drawerStyles.metaRow}>
                  {role ? <MemberRoleBadge role={role} /> : null}
                  <MemberStatusBadge status={displayMember.membership.status} />
                </div>
              </div>
            </div>
            <div className={drawerStyles.headerActions}>
              {showActions ? (
                <MenuTrigger>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={drawerStyles.kebabButton}
                    aria-label="Member actions"
                  >
                    ⋯
                  </Button>
                  <Popover className={drawerStyles.menuPopover} placement="bottom end">
                    <Menu
                      className={drawerStyles.menu}
                      aria-label="Member actions"
                      onAction={(key) => {
                        if (key === 'send-notification') {
                          onSendNotification?.(displayMember);
                        }
                      }}
                    >
                      <MenuItem id="send-notification" className={drawerStyles.menuItem}>
                        Send notification
                      </MenuItem>
                    </Menu>
                  </Popover>
                </MenuTrigger>
              ) : null}
              <Button type="button" variant="outline" size="sm" onPress={onClose}>
                Close
              </Button>
            </div>
          </header>
          <Tabs className={drawerStyles.tabs} defaultSelectedKey="profile">
            <TabList aria-label="Store member tabs" className={drawerStyles.tabList}>
              <Tab id="profile" className={drawerStyles.tab}>
                Profile &amp; Orders
              </Tab>
              <Tab id="notifications" className={drawerStyles.tab}>
                Notifications
              </Tab>
            </TabList>
            <TabPanel id="profile" className={`${drawerStyles.tabPanel} ${styles.body}`}>
              <div className={styles.stack}>
                {detailError ? (
                  <div className={drawerStyles.error} role="alert">
                    {detailError}
                  </div>
                ) : null}
                <MemberProfileBase
                  member={displayMember}
                  memberSinceOverride={memberSinceOverride ?? undefined}
                />
                <section className={profileStyles.card} aria-label="Store orders">
                  <div className={`${profileStyles.sectionHeader} ${styles.ordersHeader}`}>
                    <div>
                      <h3 className={profileStyles.sectionTitle}>Orders</h3>
                      <p className={profileStyles.sectionHint}>
                        Store orders assigned to this member.
                      </p>
                    </div>
                    {ordersCountLabel ? (
                      <span className={styles.ordersCount}>{ordersCountLabel}</span>
                    ) : null}
                  </div>
                  {ordersLoading ? (
                    <div className={styles.ordersLoading}>
                      <div className={styles.orderSkeleton} style={{ width: '70%' }} />
                      <div className={styles.orderSkeleton} style={{ width: '85%' }} />
                      <div className={styles.orderSkeleton} style={{ width: '60%' }} />
                    </div>
                  ) : ordersError ? (
                    <div className={styles.ordersError} role="alert">
                      <span>{ordersError}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onPress={refreshOrders}
                        isDisabled={ordersLoading}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : orders.length === 0 ? (
                    <p className={styles.ordersEmpty}>No orders assigned yet.</p>
                  ) : (
                    <div className={styles.ordersList}>
                      {orders.map((order) => (
                        <div key={order.key} className={styles.orderRow}>
                          <div className={styles.orderInfo}>
                            <span className={styles.orderLabel}>{order.label}</span>
                            <span className={styles.orderStatus}>{order.statusLabel}</span>
                          </div>
                          <div className={styles.orderMeta}>
                            <span className={styles.orderTotal}>{order.totalLabel}</span>
                            <span className={styles.orderTime}>{order.placedAtLabel}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </TabPanel>
            <TabPanel id="notifications" className={`${drawerStyles.tabPanel} ${styles.body}`}>
              <MemberNotificationsTab
                memberId={displayMember.membership.user_id}
                memberName={displayName}
                canSend={canSendNotification}
              />
            </TabPanel>
          </Tabs>
        </div>
      </section>
    </div>
  );
}
