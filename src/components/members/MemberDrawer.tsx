import { getLocalTimeZone, today, type DateValue } from '@internationalized/date';
import type { RangeValue } from '@react-types/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCell,
  CalendarGrid,
  DateInput,
  DateRangePicker,
  DateSegment,
  Group,
  Heading,
  ListBox,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  RangeCalendar,
  Select,
  SelectValue,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components';
import { HttpError } from '../../services/http';
import {
  forceMemberReauth,
  getMemberAudit,
  getMemberDetail,
  removeMember,
  type AuditCategory,
  type AuditEntry,
  type MemberDetail,
  type MemberRole,
  type MemberStatus,
  type MemberStoreAssignment,
  type MembershipRecord,
  type MemberWithUser,
  updateMemberStatus,
} from '../../services/membership';
import { Button } from '../common/Button/Button';
import { ConfirmDialog } from '../common/ConfirmDialog/ConfirmDialog';
import { AdminProfileExtensions } from './AdminProfileExtensions';
import { MemberNotificationsTab } from './MemberNotificationsTab';
import { MemberRoleBadge } from './MemberRoleBadge';
import { MemberStatusBadge } from './MemberStatusBadge';
import { MemberProfileBase } from './MemberProfileBase';
import styles from './MemberDrawer.module.css';

type MemberDrawerProps = {
  isOpen: boolean;
  member: MemberWithUser | null;
  onClose: () => void;
  viewerRole?: MemberRole | null;
  onMemberUpdated?: () => void;
  onActionMessage?: (message: ActionMessage) => void;
};

type ActionMessageTone = 'info' | 'error' | 'success';
type ActionMessage = {
  tone: ActionMessageTone;
  text: string;
} | null;

type MemberActionsMenuProps = {
  viewerRole?: MemberRole | null;
  targetRole?: MemberRole | null;
  targetStatus?: MemberStatus | null;
  isSelf?: boolean;
  isLoading?: boolean;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onRemove: () => void;
  onForceReauth: () => void;
};

type AuditCategoryFilter = 'all' | 'security' | 'orders' | 'settings' | 'membership';
type DateRangeValue = RangeValue<DateValue> | null;

type AuditFilterState = {
  category: AuditCategoryFilter;
  range: DateRangeValue;
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

function normalizeStatus(status?: string | null) {
  return status?.trim().toLowerCase() ?? '';
}

const AUDIT_PAGE_SIZE = 20;
const DEFAULT_RANGE_DAYS = 30;

const AUDIT_FILTER_OPTIONS: { id: AuditCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'security', label: 'Security' },
  { id: 'orders', label: 'Orders' },
  { id: 'settings', label: 'Settings' },
  { id: 'membership', label: 'Membership' },
];

const AUDIT_CATEGORY_META: Record<string, { label: string; icon: string; className: string }> = {
  security: { label: 'Security', icon: '🔐', className: styles.auditIconSecurity },
  orders: { label: 'Orders', icon: '📦', className: styles.auditIconOrders },
  settings: { label: 'Settings', icon: '⚙️', className: styles.auditIconSettings },
  membership: { label: 'Membership', icon: '👤', className: styles.auditIconMembership },
  store: { label: 'Store', icon: '🏪', className: styles.auditIconStore },
};

function formatAuditAction(action: string) {
  const normalized = action.replace(/_/g, ' ').trim();
  if (!normalized) return 'Activity recorded';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatAuditCategory(category: AuditCategory | null | undefined) {
  if (!category) return 'Activity';
  const key = category.toString().trim().toLowerCase();
  return AUDIT_CATEGORY_META[key]?.label ?? category.toString();
}

function getAuditCategoryMeta(category: AuditCategory | null | undefined) {
  const key = category?.toString().trim().toLowerCase() ?? '';
  return (
    AUDIT_CATEGORY_META[key] ?? {
      label: formatAuditCategory(category),
      icon: '•',
      className: styles.auditIconDefault,
    }
  );
}

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSeconds < 60) return formatter.format(diffSeconds, 'second');
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day');
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return formatter.format(diffMonths, 'month');
  const diffYears = Math.round(diffDays / 365);
  return formatter.format(diffYears, 'year');
}

function formatExactTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function getAuditErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  if (httpError?.status && httpError.status >= 500) {
    return fallback;
  }
  return getErrorMessage(error, fallback);
}

type NormalizedAuditResponse = {
  data: AuditEntry[];
  nextCursor: string | null;
  valid: boolean;
};

function normalizeAuditResponse(
  result: { data?: AuditEntry[]; next_cursor?: string | null } | null | undefined,
): NormalizedAuditResponse {
  if (!result || !Array.isArray(result.data)) {
    return { data: [], nextCursor: null, valid: false };
  }
  const nextCursor =
    typeof result.next_cursor === 'string' && result.next_cursor.trim() ? result.next_cursor : null;
  return { data: result.data, nextCursor, valid: true };
}

function MemberActionsMenu({
  viewerRole,
  targetRole,
  targetStatus,
  isSelf = false,
  isLoading = false,
  onSuspend,
  onUnsuspend,
  onRemove,
  onForceReauth,
}: MemberActionsMenuProps) {
  const canManage = viewerRole === 'admin' || viewerRole === 'super_admin';
  if (!canManage) return null;

  const status = normalizeStatus(targetStatus);
  const isActive = status === 'active';
  const isSuspended = status === 'disabled' || status === 'suspended';
  const isTargetSuperAdmin = targetRole === 'super_admin';
  const baseDisabled = isLoading;

  type ActionKey = 'suspend' | 'unsuspend' | 'remove' | 'force-reauth';
  type MenuItemConfig = {
    id: ActionKey;
    label: string;
    show: boolean;
    disabled: boolean;
    disabledReason?: string;
  };

  const getDisabledReason = (actionId: ActionKey) => {
    if (baseDisabled) return 'Member details are still loading.';
    if (isSelf) {
      if (actionId === 'force-reauth') {
        return 'You cannot force re-authentication on yourself.';
      }
      return 'You cannot perform this action on yourself.';
    }
    if (isTargetSuperAdmin && (actionId === 'suspend' || actionId === 'unsuspend')) {
      return 'Cannot suspend the organization owner.';
    }
    if (isTargetSuperAdmin && actionId === 'remove') {
      return 'Cannot remove the organization owner.';
    }
    return undefined;
  };

  const items = [
    {
      id: 'suspend',
      label: 'Suspend member',
      show: isActive,
      disabled: baseDisabled || isSelf || isTargetSuperAdmin,
    },
    {
      id: 'unsuspend',
      label: 'Unsuspend member',
      show: isSuspended,
      disabled: baseDisabled || isSelf || isTargetSuperAdmin,
    },
    {
      id: 'remove',
      label: 'Remove member',
      show: true,
      disabled: baseDisabled || isSelf || isTargetSuperAdmin,
    },
    {
      id: 'force-reauth',
      label: 'Force re-authentication',
      show: isActive,
      disabled: baseDisabled || isSelf,
    },
  ] satisfies MenuItemConfig[];

  const visibleItems = items
    .filter((item) => item.show)
    .map((item) => ({
      ...item,
      disabledReason: item.disabled ? getDisabledReason(item.id) : undefined,
    }));

  const actionMap: Record<ActionKey, () => void> = {
    suspend: onSuspend,
    unsuspend: onUnsuspend,
    remove: onRemove,
    'force-reauth': onForceReauth,
  };

  return (
    <MenuTrigger>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={styles.kebabButton}
        aria-label="Member actions"
      >
        ⋯
      </Button>
      <Popover className={styles.menuPopover} placement="bottom end">
        <Menu
          className={styles.menu}
          aria-label="Member actions"
          onAction={(key) => {
            const action = actionMap[String(key) as ActionKey];
            if (action) action();
          }}
        >
          {visibleItems.length === 0 ? (
            <MenuItem id="no-actions" className={styles.menuItem} isDisabled>
              No actions available
            </MenuItem>
          ) : (
            visibleItems.map((item) => (
              <MenuItem
                key={item.id}
                id={item.id}
                className={styles.menuItem}
                isDisabled={item.disabled}
                aria-label={item.disabledReason ?? item.label}
                title={item.disabledReason}
              >
                {item.label}
              </MenuItem>
            ))
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function LoadingPanel() {
  return (
    <div className={styles.loading}>
      <div className={styles.skeletonBar} style={{ width: '60%' }} />
      <div className={styles.skeletonBar} style={{ width: '80%' }} />
      <div className={styles.skeletonBar} style={{ width: '45%' }} />
      <div className={styles.skeletonBar} style={{ width: '70%' }} />
    </div>
  );
}

type AuditFilterBarProps = {
  category: AuditCategoryFilter;
  range: DateRangeValue;
  onCategoryChange: (value: AuditCategoryFilter) => void;
  onRangeChange: (value: DateRangeValue) => void;
  isDisabled?: boolean;
};

function AuditFilterBar({
  category,
  range,
  onCategoryChange,
  onRangeChange,
  isDisabled = false,
}: AuditFilterBarProps) {
  return (
    <div className={styles.auditFilters}>
      <div className={styles.auditFilter}>
        <span className={styles.auditFilterLabel}>Category</span>
        <Select
          aria-label="Filter activity by category"
          value={category}
          onChange={(value) => {
            if (!value) return;
            onCategoryChange(String(value) as AuditCategoryFilter);
          }}
          isDisabled={isDisabled}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={styles.auditSelectTrigger}
            isDisabled={isDisabled}
          >
            <SelectValue className={styles.auditSelectValue}>
              {({ selectedText }) => selectedText || 'All'}
            </SelectValue>
            <span aria-hidden="true" className={styles.auditSelectCaret}>
              v
            </span>
          </Button>
          <Popover className={styles.auditSelectPopover} placement="bottom start">
            <ListBox className={styles.auditListBox}>
              {AUDIT_FILTER_OPTIONS.map((option) => (
                <ListBoxItem
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                  className={styles.auditListItem}
                >
                  {option.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </Popover>
        </Select>
      </div>

      <div className={styles.auditFilter}>
        <span className={styles.auditFilterLabel}>Date range</span>
        <DateRangePicker
          aria-label="Filter activity by date range"
          value={range}
          onChange={onRangeChange}
          isDisabled={isDisabled}
          className={styles.dateRangePicker}
        >
          <Group className={styles.dateRangeGroup}>
            <DateInput slot="start" className={styles.dateInput}>
              {(segment) => <DateSegment segment={segment} className={styles.dateSegment} />}
            </DateInput>
            <span aria-hidden="true" className={styles.dateRangeSeparator}>
              –
            </span>
            <DateInput slot="end" className={styles.dateInput}>
              {(segment) => <DateSegment segment={segment} className={styles.dateSegment} />}
            </DateInput>
            <Button
              type="button"
              variant="outline"
              size="sm"
              slot="button"
              className={styles.dateRangeButton}
              aria-label="Choose date range"
              isDisabled={isDisabled}
            >
              📅
            </Button>
          </Group>
          <Popover className={styles.dateRangePopover} placement="bottom end">
            <RangeCalendar className={styles.rangeCalendar}>
              <header className={styles.calendarHeader}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  slot="previous"
                  className={styles.calendarNavButton}
                >
                  ‹
                </Button>
                <Heading className={styles.calendarHeading} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  slot="next"
                  className={styles.calendarNavButton}
                >
                  ›
                </Button>
              </header>
              <CalendarGrid className={styles.calendarGrid}>
                {(date) => <CalendarCell date={date} className={styles.calendarCell} />}
              </CalendarGrid>
            </RangeCalendar>
          </Popover>
        </DateRangePicker>
      </div>
    </div>
  );
}

function AuditLoading() {
  return (
    <div className={styles.auditLoading}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`audit-skeleton-${index}`} className={styles.auditSkeletonRow}>
          <div className={styles.auditSkeletonIcon} />
          <div className={styles.auditSkeletonLines}>
            <div className={styles.auditSkeletonLine} style={{ width: '40%' }} />
            <div className={styles.auditSkeletonLine} style={{ width: '75%' }} />
            <div className={styles.auditSkeletonLine} style={{ width: '55%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

type AuditTimelineEntryProps = {
  entry: AuditEntry;
  isLast: boolean;
};

function AuditTimelineEntry({ entry, isLast }: AuditTimelineEntryProps) {
  const meta = getAuditCategoryMeta(entry.category);
  const relativeTime = formatRelativeTime(entry.timestamp);
  const exactTime = formatExactTime(entry.timestamp);
  const actorName = entry.actor_name || 'System';
  const showTarget = Boolean(entry.target_name && entry.target_name !== actorName);

  return (
    <div className={styles.timelineEntry} data-last={isLast ? 'true' : 'false'}>
      <div className={styles.timelineMarker}>
        <span className={`${styles.timelineIcon} ${meta.className}`} aria-hidden="true">
          {meta.icon}
        </span>
        <span className={styles.timelineLine} aria-hidden="true" />
      </div>
      <div className={styles.timelineContent}>
        <div className={styles.timelineMeta}>
          <span className={styles.timelineCategory}>{meta.label}</span>
          <time className={styles.timelineTime} dateTime={entry.timestamp} title={exactTime}>
            {relativeTime}
          </time>
        </div>
        <p className={styles.timelineAction}>{formatAuditAction(entry.action)}</p>
        <p className={styles.timelineActor}>
          By {actorName}
          {showTarget ? ` · Target: ${entry.target_name}` : ''}
        </p>
      </div>
    </div>
  );
}

type MemberAuditTimelineProps = {
  memberId: string | null;
  viewerRole?: MemberRole | null;
};

function MemberAuditTimeline({ memberId, viewerRole }: MemberAuditTimelineProps) {
  const canManageMembers = viewerRole === 'admin' || viewerRole === 'super_admin';
  const [filters, setFilters] = useState<AuditFilterState>(() => {
    const end = today(getLocalTimeZone());
    return { category: 'all', range: { start: end.subtract({ days: DEFAULT_RANGE_DAYS }), end } };
  });
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadAudit = useCallback(
    async ({ cursor, append }: { cursor?: string | null; append?: boolean }) => {
      if (!memberId) return;
      const requestId = (requestIdRef.current += 1);
      const isAppend = Boolean(append);

      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setEntries([]);
      }
      setError(null);

      try {
        const params: {
          category?: string;
          after?: string;
          before?: string;
          limit?: number;
          cursor?: string;
        } = {
          limit: AUDIT_PAGE_SIZE,
        };

        if (filters.category !== 'all') {
          params.category = filters.category;
        }

        if (filters.range?.start) {
          params.after = filters.range.start.toString();
        }
        if (filters.range?.end) {
          params.before = filters.range.end.toString();
        }

        if (cursor) {
          params.cursor = cursor;
        }

        const result = await getMemberAudit(memberId, params);
        if (requestIdRef.current !== requestId) return;

        const normalized = normalizeAuditResponse(result);
        if (!normalized.valid) {
          setError('Unexpected response while loading activity.');
          if (!isAppend) {
            setEntries([]);
            setNextCursor(null);
          }
          return;
        }

        setEntries((prev) => (isAppend ? [...prev, ...normalized.data] : normalized.data));
        setNextCursor(normalized.nextCursor);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setError(getAuditErrorMessage(err, 'Unable to load activity.'));
        if (!isAppend) {
          setEntries([]);
          setNextCursor(null);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filters, memberId],
  );

  useEffect(() => {
    if (!memberId || !canManageMembers) return;
    loadAudit({ append: false });
  }, [canManageMembers, filters.category, filters.range, loadAudit, memberId]);

  if (!canManageMembers) {
    return (
      <div className={styles.auditRestricted}>Activity is available to admins and owners only.</div>
    );
  }

  if (!memberId) {
    return null;
  }

  const handleLoadMore = () => {
    if (!nextCursor || loadingMore) return;
    loadAudit({ cursor: nextCursor, append: true });
  };

  const handleRetry = () => {
    if (loading) return;
    loadAudit({ append: false });
  };

  const showErrorBanner = Boolean(error) && entries.length > 0;
  const showInlineError = Boolean(error) && entries.length === 0;

  return (
    <div className={styles.auditPanel}>
      <div className={styles.auditHeader}>
        <div>
          <h3 className={styles.auditTitle}>Activity</h3>
          <p className={styles.auditSubtitle}>
            Review security and membership events for this member.
          </p>
        </div>
        <AuditFilterBar
          category={filters.category}
          range={filters.range}
          onCategoryChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              category: value,
            }))
          }
          onRangeChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              range: value,
            }))
          }
          isDisabled={loading}
        />
      </div>

      <div className={styles.auditBody}>
        {showErrorBanner ? (
          <div className={styles.auditErrorBanner} role="alert">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={handleRetry}
              isDisabled={loading || loadingMore}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {loading ? (
          <AuditLoading />
        ) : showInlineError ? (
          <div className={styles.auditError} role="alert">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={handleRetry}
              isDisabled={loading || loadingMore}
            >
              Retry
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.auditEmpty}>No activity matching filters.</div>
        ) : (
          <div className={styles.timeline}>
            {entries.map((entry, index) => (
              <AuditTimelineEntry
                key={entry.id}
                entry={entry}
                isLast={index === entries.length - 1}
              />
            ))}
          </div>
        )}

        {nextCursor && !loading ? (
          <div className={styles.loadMoreRow}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={handleLoadMore}
              isDisabled={loadingMore}
            >
              {loadingMore ? 'Loading more...' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MemberDrawer({
  isOpen,
  member,
  onClose,
  viewerRole,
  onMemberUpdated,
  onActionMessage,
}: MemberDrawerProps) {
  const lastMemberRef = useRef<MemberWithUser | null>(null);
  const requestIdRef = useRef(0);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    'suspend' | 'unsuspend' | 'remove' | 'force-reauth' | null
  >(null);
  const [actionLoading, setActionLoading] = useState<
    'suspend' | 'unsuspend' | 'remove' | 'force-reauth' | null
  >(null);
  const memberId = member?.membership.user_id ?? null;

  if (member) {
    lastMemberRef.current = member;
  }

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

  const loadMember = useCallback(async (id: string, options?: { reset?: boolean }) => {
    const requestId = (requestIdRef.current += 1);
    setLoading(true);
    setError(null);
    if (options?.reset !== false) {
      setDetail(null);
    }

    try {
      const data = await getMemberDetail(id);
      if (requestIdRef.current !== requestId) return;
      setDetail(data);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const detailsMessage = (httpError.details as { message?: string } | undefined)?.message;
      setError(detailsMessage ?? httpError.message ?? 'Unable to load member.');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !memberId) return;
    loadMember(memberId);
  }, [isOpen, memberId, loadMember]);

  useEffect(() => {
    if (!isOpen) {
      setPendingAction(null);
      setActionError(null);
      setActionLoading(null);
      setActionMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const overlayState = isOpen ? 'open' : 'closed';
  const displayMember = detail ?? member ?? lastMemberRef.current;

  const headerSubtitle = loading ? 'Refreshing member details...' : 'Member details';

  const targetRole = displayMember?.membership.role ?? null;
  const targetStatus = displayMember?.membership.status ?? null;
  const isSelf = detail?.is_self ?? false;
  const avatarUrl = displayMember?.user.image_url ?? null;
  const showLoading = loading || (!detail && !error);
  const canManageMembers = viewerRole === 'admin' || viewerRole === 'super_admin';
  const displayName = displayMember ? getDisplayName(displayMember) : 'this member';
  const storeAssignmentCount = detail?.store_assignments?.length;

  const handleMemberDetailUpdate = useCallback((updated: MemberDetail) => {
    setDetail(updated);
  }, []);

  const handleMembershipUpdate = useCallback((updated: MembershipRecord) => {
    setDetail((prev) => {
      if (!prev) return prev;
      return { ...prev, membership: { ...prev.membership, ...updated } };
    });
  }, []);

  const handleAssignmentsUpdate = useCallback((nextAssignments: MemberStoreAssignment[]) => {
    setDetail((prev) => {
      if (!prev) return prev;
      return { ...prev, store_assignments: nextAssignments };
    });
  }, []);

  const tabContent = useMemo(() => {
    if (showLoading) return <LoadingPanel />;
    if (error) {
      return (
        <div className={styles.error} role="alert">
          {error}
        </div>
      );
    }
    return null;
  }, [error, showLoading]);

  const emitActionMessage = useCallback(
    (message: ActionMessage) => {
      setActionMessage(message);
      onActionMessage?.(message);
    },
    [onActionMessage],
  );

  const closePendingAction = useCallback(() => {
    if (actionLoading) return;
    setPendingAction(null);
    setActionError(null);
  }, [actionLoading]);

  const openPendingAction = useCallback(
    (action: 'suspend' | 'unsuspend' | 'remove' | 'force-reauth') => {
      if (actionLoading) return;
      setActionError(null);
      setPendingAction(action);
    },
    [actionLoading],
  );

  const refreshMember = useCallback(async () => {
    if (!memberId) return;
    await loadMember(memberId, { reset: false });
  }, [loadMember, memberId]);

  const handleStatusChange = useCallback(
    async (nextStatus: 'active' | 'disabled') => {
      if (!memberId) return;
      const actionKey = nextStatus === 'disabled' ? 'suspend' : 'unsuspend';
      setActionLoading(actionKey);
      setActionError(null);

      try {
        const updated = await updateMemberStatus(memberId, nextStatus);
        setDetail(updated);
        emitActionMessage({
          tone: 'success',
          text:
            nextStatus === 'disabled'
              ? `Suspended ${displayName}.`
              : `Restored ${displayName}'s access.`,
        });
        setPendingAction(null);
        onMemberUpdated?.();
        await refreshMember();
      } catch (err) {
        setActionError(
          getErrorMessage(
            err,
            nextStatus === 'disabled' ? 'Unable to suspend member.' : 'Unable to unsuspend member.',
          ),
        );
      } finally {
        setActionLoading(null);
      }
    },
    [displayName, emitActionMessage, memberId, onMemberUpdated, refreshMember],
  );

  const handleForceReauth = useCallback(async () => {
    if (!memberId) return;
    setActionLoading('force-reauth');
    setActionError(null);

    try {
      await forceMemberReauth(memberId);
      emitActionMessage({
        tone: 'success',
        text: `Forced ${displayName} to sign in again.`,
      });
      setPendingAction(null);
      onMemberUpdated?.();
      await refreshMember();
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to force re-authentication.'));
    } finally {
      setActionLoading(null);
    }
  }, [displayName, emitActionMessage, memberId, onMemberUpdated, refreshMember]);

  const handleRemoveMember = useCallback(async () => {
    if (!memberId) return;
    setActionLoading('remove');
    setActionError(null);

    try {
      await removeMember(memberId);
      emitActionMessage({
        tone: 'success',
        text: `${displayName} has been removed from the organization.`,
      });
      setPendingAction(null);
      onMemberUpdated?.();
      onClose();
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to remove member.'));
    } finally {
      setActionLoading(null);
    }
  }, [displayName, emitActionMessage, memberId, onClose, onMemberUpdated]);

  if (!displayMember) return null;

  const removeDetails = (
    <div className={styles.confirmDetails}>
      <p>
        <span className={styles.confirmLabel}>Store assignments:</span>{' '}
        {storeAssignmentCount === undefined
          ? 'Loading...'
          : storeAssignmentCount === 0
            ? 'None'
            : `${storeAssignmentCount} store${storeAssignmentCount === 1 ? '' : 's'}`}
      </p>
      <p>
        <span className={styles.confirmLabel}>Pending order assignments:</span> Not available
      </p>
    </div>
  );

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={isOpen ? onClose : undefined}
      data-state={overlayState}
      aria-hidden={!isOpen}
    >
      <section
        className={styles.drawer}
        data-state={overlayState}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialog}>
          <header className={styles.header}>
            <div className={styles.identity}>
              <div className={styles.avatar} aria-hidden="true">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className={styles.avatarImage} />
                ) : (
                  getInitials(displayMember)
                )}
              </div>
              <div>
                <h2 id="member-drawer-title" className={styles.title}>
                  {getDisplayName(displayMember)}
                </h2>
                <p className={styles.subtitle}>{headerSubtitle}</p>
                <div className={styles.metaRow}>
                  <MemberRoleBadge role={displayMember.membership.role} />
                  <MemberStatusBadge status={displayMember.membership.status} />
                </div>
              </div>
            </div>
            <div className={styles.headerActions}>
              <MemberActionsMenu
                viewerRole={viewerRole}
                targetRole={targetRole}
                targetStatus={targetStatus}
                isSelf={isSelf}
                isLoading={loading || actionLoading !== null}
                onSuspend={() => openPendingAction('suspend')}
                onUnsuspend={() => openPendingAction('unsuspend')}
                onRemove={() => openPendingAction('remove')}
                onForceReauth={() => openPendingAction('force-reauth')}
              />
              <Button type="button" variant="outline" size="sm" onPress={onClose}>
                Close
              </Button>
            </div>
          </header>
          {actionMessage ? (
            <div className={styles.actionMessage} data-tone={actionMessage.tone} role="status">
              {actionMessage.text}
            </div>
          ) : null}
          <Tabs
            key={memberId ?? 'member-drawer'}
            className={styles.tabs}
            defaultSelectedKey="profile"
          >
            <TabList aria-label="Member detail tabs" className={styles.tabList}>
              <Tab id="profile" className={styles.tab}>
                Profile
              </Tab>
              {canManageMembers ? (
                <Tab id="activity" className={styles.tab}>
                  Activity
                </Tab>
              ) : null}
              <Tab id="notifications" className={styles.tab}>
                Notifications
              </Tab>
            </TabList>
            <TabPanel id="profile" className={styles.tabPanel}>
              {tabContent ?? (
                <div className={styles.profileStack}>
                  <MemberProfileBase member={detail ?? displayMember} />
                  {canManageMembers && detail ? (
                    <AdminProfileExtensions
                      member={detail}
                      viewerRole={viewerRole}
                      displayName={getDisplayName(displayMember)}
                      onMemberDetailUpdate={handleMemberDetailUpdate}
                      onMembershipUpdate={handleMembershipUpdate}
                      onAssignmentsUpdate={handleAssignmentsUpdate}
                    />
                  ) : null}
                </div>
              )}
            </TabPanel>
            {canManageMembers ? (
              <TabPanel id="activity" className={styles.tabPanel}>
                {tabContent ?? <MemberAuditTimeline memberId={memberId} viewerRole={viewerRole} />}
              </TabPanel>
            ) : null}
            <TabPanel id="notifications" className={styles.tabPanel}>
              {tabContent ?? (
                <MemberNotificationsTab
                  memberId={memberId}
                  memberName={displayName}
                  canSend={canManageMembers}
                />
              )}
            </TabPanel>
          </Tabs>
        </div>
      </section>

      <ConfirmDialog
        isOpen={pendingAction === 'suspend'}
        title={`Suspend ${displayName}?`}
        description={`This will immediately log out ${displayName} and prevent access.`}
        confirmLabel="Suspend member"
        onConfirm={() => handleStatusChange('disabled')}
        onCancel={closePendingAction}
        loading={actionLoading === 'suspend'}
        error={actionError}
      />

      <ConfirmDialog
        isOpen={pendingAction === 'unsuspend'}
        title={`Restore ${displayName}'s access?`}
        description={`This will restore ${displayName}'s access to the organization.`}
        confirmLabel="Restore access"
        onConfirm={() => handleStatusChange('active')}
        onCancel={closePendingAction}
        loading={actionLoading === 'unsuspend'}
        error={actionError}
      />

      <ConfirmDialog
        isOpen={pendingAction === 'force-reauth'}
        title={`Force ${displayName} to re-authenticate?`}
        description={`This will revoke all active sessions. ${displayName} will need to log in again.`}
        confirmLabel="Force re-auth"
        onConfirm={handleForceReauth}
        onCancel={closePendingAction}
        loading={actionLoading === 'force-reauth'}
        error={actionError}
      />

      <ConfirmDialog
        isOpen={pendingAction === 'remove'}
        title={`Remove ${displayName}?`}
        description={`This will permanently remove ${displayName} from the organization. They will lose access to all stores and data.`}
        details={removeDetails}
        confirmLabel="Remove member"
        onConfirm={handleRemoveMember}
        onCancel={closePendingAction}
        loading={actionLoading === 'remove'}
        error={actionError}
      />
    </div>
  );
}
