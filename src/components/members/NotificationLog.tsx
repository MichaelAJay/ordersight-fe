import { useMemo } from 'react';
import { type MemberNotification } from '../../services/membership';
import { formatDateTime, formatRelativeTime } from '../../utils/date';
import { Button } from '../common/Button/Button';
import styles from './NotificationLog.module.css';

type Props = {
  entries: MemberNotification[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
};

const skeletonRows = Array.from({ length: 4 }, (_, index) => ({
  id: `notification-skeleton-${index}`,
}));

function formatChannel(channel?: string | null) {
  if (!channel) return 'Unknown';
  const normalized = channel.trim().toLowerCase();
  if (normalized === 'email') return 'Email';
  return normalized.replace(/_/g, ' ');
}

function formatStatus(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').toLowerCase();
}

function getStatusTone(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return 'neutral';
  if (normalized === 'sent') return 'success';
  if (normalized === 'failed') return 'error';
  if (normalized === 'queued') return 'info';
  return 'neutral';
}

export function NotificationLog({
  entries,
  loading = false,
  error,
  emptyMessage = 'No notifications yet.',
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onRetry,
}: Props) {
  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const left = Date.parse(a.sent_at ?? '');
      const right = Date.parse(b.sent_at ?? '');
      if (Number.isNaN(left) || Number.isNaN(right)) return 0;
      return right - left;
    });
  }, [entries]);

  if (loading) {
    return (
      <div className={styles.log} aria-live="polite" aria-busy="true">
        {skeletonRows.map((row) => (
          <div key={row.id} className={styles.skeletonRow}>
            <div className={styles.skeletonLine} style={{ width: '70%' }} />
            <div className={styles.skeletonLine} style={{ width: '40%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error} role="alert">
        <span>{error}</span>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onPress={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (sorted.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.log}>
      {sorted.map((entry) => {
        const sentRelative = formatRelativeTime(entry.sent_at);
        const sentExact = formatDateTime(entry.sent_at);
        const status = formatStatus(entry.status);
        const channel = formatChannel(entry.channel);

        return (
          <div key={entry.id} className={styles.logItem}>
            <div className={styles.logHeader}>
              <h4 className={styles.subject}>{entry.subject || 'Untitled notification'}</h4>
              <span className={styles.timestamp} title={sentExact}>
                {sentRelative}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Channel</span>
              <span className={styles.badge} data-tone="neutral">
                {channel}
              </span>
              <span className={styles.metaLabel}>Status</span>
              <span className={styles.badge} data-tone={getStatusTone(entry.status)}>
                {status}
              </span>
            </div>
          </div>
        );
      })}

      {hasMore ? (
        <div className={styles.loadMoreRow}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={onLoadMore}
            isDisabled={loadingMore || !onLoadMore}
          >
            {loadingMore ? 'Loading more...' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
