import { useCallback, useEffect, useRef, useState } from 'react';
import { HttpError } from '../../services/http';
import {
  getMemberNotifications,
  sendNotification,
  type MemberNotification,
  type MemberNotificationResponse,
} from '../../services/membership';
import { Button } from '../common/Button/Button';
import { NotificationLog } from './NotificationLog';
import { SendNotificationAction } from './SendNotificationAction';
import { SendNotificationDialog } from './SendNotificationDialog';
import styles from './MemberNotificationsTab.module.css';

type ActionMessageTone = 'info' | 'error' | 'success';
type ActionMessage = {
  tone: ActionMessageTone;
  text: string;
} | null;

type ApiErrorDetails = {
  code?: string;
  message?: string;
  meta?: unknown;
};

type Props = {
  memberId: string | null;
  memberName?: string;
  canSend?: boolean;
};

const NOTIFICATION_PAGE_SIZE = 10;

type NormalizedNotificationResponse = {
  data: MemberNotification[];
  nextCursor: string | null;
  valid: boolean;
};

function normalizeNotificationResponse(
  response: MemberNotificationResponse | null | undefined,
): NormalizedNotificationResponse {
  if (!response || !Array.isArray(response.data)) {
    return { data: [], nextCursor: null, valid: false };
  }
  const nextCursor =
    typeof response.next_cursor === 'string' && response.next_cursor.trim()
      ? response.next_cursor
      : null;
  return { data: response.data, nextCursor, valid: true };
}

function getHistoryErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  if (httpError?.status && httpError.status >= 500) {
    return fallback;
  }
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function getSendErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const status = httpError?.status;
  const details = (httpError?.details ?? {}) as ApiErrorDetails;
  const code = details?.code;

  if (status === 401) {
    return 'Reconnect your session to send notifications.';
  }

  if (status === 403 && code === 'org_not_bootstrapped') {
    return 'Organization setup is incomplete. Please contact support.';
  }

  if (status === 403) {
    return details?.message ?? httpError?.message ?? 'You are not allowed to send notifications.';
  }

  if (!status || status >= 500) {
    return 'Notification failed. Please try again.';
  }

  return details?.message ?? httpError?.message ?? fallback;
}

export function MemberNotificationsTab({
  memberId,
  memberName = 'this member',
  canSend = true,
}: Props) {
  const requestIdRef = useRef(0);
  const [entries, setEntries] = useState<MemberNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);

  const fetchNotifications = useCallback(
    async (options?: { cursor?: string | null; append?: boolean }) => {
      if (!memberId) return;
      const requestId = (requestIdRef.current += 1);
      const append = options?.append ?? false;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const response: MemberNotificationResponse = await getMemberNotifications(memberId, {
          limit: NOTIFICATION_PAGE_SIZE,
          cursor: options?.cursor ?? undefined,
        });

        if (requestIdRef.current !== requestId) return;

        const normalizedResponse = normalizeNotificationResponse(response);
        if (!normalizedResponse.valid) {
          setError('Unexpected response while loading notifications.');
          return;
        }

        setEntries((prev) =>
          append ? [...prev, ...normalizedResponse.data] : normalizedResponse.data,
        );
        setCursor(normalizedResponse.nextCursor);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setError(getHistoryErrorMessage(err, 'Unable to load notifications.'));
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [memberId],
  );

  useEffect(() => {
    if (!memberId) {
      setEntries([]);
      setCursor(null);
      setError(null);
      return;
    }
    fetchNotifications();
  }, [memberId, fetchNotifications]);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const handleLoadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    fetchNotifications({ cursor, append: true });
  }, [cursor, fetchNotifications, loadingMore]);

  const openSendDialog = () => {
    if (!memberId || !canSend) return;
    setSendError(null);
    setSendOpen(true);
  };

  const closeSendDialog = () => {
    if (sendLoading) return;
    setSendOpen(false);
    setSendError(null);
  };

  const handleSend = async (payload: { subject: string; body: string }) => {
    if (!memberId) {
      setSendError('Select a member to notify.');
      return;
    }

    setSendLoading(true);
    setSendError(null);

    try {
      const response = await sendNotification({
        recipient_ids: [memberId],
        subject: payload.subject,
        body: payload.body,
        channel: 'email',
      });

      const failedCount = response.failed?.length ?? 0;
      if (failedCount > 0) {
        setActionMessage({
          tone: 'error',
          text: `Sent ${response.sent_count} notification${
            response.sent_count === 1 ? '' : 's'
          }. ${failedCount} failed.`,
        });
      } else {
        setActionMessage({
          tone: 'success',
          text: `Notification sent to ${memberName}.`,
        });
      }

      setSendOpen(false);
      await fetchNotifications();
    } catch (err) {
      setSendError(getSendErrorMessage(err, 'Unable to send notification.'));
    } finally {
      setSendLoading(false);
    }
  };

  const showErrorBanner = Boolean(error) && entries.length > 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Notifications</h3>
          <p className={styles.subtitle}>History of email notifications sent to this member.</p>
        </div>
        <div className={styles.headerActions}>
          <SendNotificationAction onPress={openSendDialog} isDisabled={!canSend || !memberId} />
        </div>
      </div>

      <div className={styles.stubNotice}>STUB: History feed awaits backend implementation.</div>

      {actionMessage ? (
        <div className={styles.actionMessage} data-tone={actionMessage.tone} role="status">
          {actionMessage.text}
        </div>
      ) : null}

      {showErrorBanner ? (
        <div className={styles.errorBanner} role="alert">
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() => fetchNotifications()}
            isDisabled={loading || loadingMore}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <NotificationLog
        entries={entries}
        loading={loading}
        error={entries.length === 0 ? error : null}
        emptyMessage="No notifications sent to this member yet."
        hasMore={Boolean(cursor)}
        loadingMore={loadingMore}
        onLoadMore={handleLoadMore}
        onRetry={() => fetchNotifications()}
      />

      <SendNotificationDialog
        key={sendOpen ? 'send-open' : 'send-closed'}
        isOpen={sendOpen}
        recipientCount={memberId ? 1 : 0}
        loading={sendLoading}
        error={sendError}
        onSend={handleSend}
        onClose={closeSendDialog}
      />
    </div>
  );
}
