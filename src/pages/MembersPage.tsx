import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Slider,
  SliderThumb,
  SliderTrack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type Selection,
} from 'react-aria-components';
import { HttpError } from '../services/http';
import {
  exportMembers,
  getMemberSummary,
  InviteResult,
  InviteSummaryResponse,
  InviteWithDecrypted,
  getInviteSummary,
  MemberSummaryResponse,
  MemberWithUser,
  Pagination,
  SeatAvailability,
  resendInvite,
  sendNotification,
  uninviteInvite,
} from '../services/membership';
import { Button } from '@/components/common/Button/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog/ConfirmDialog';
import { BatchInviteTrigger } from '@/components/members/BatchInviteTrigger';
import { MemberDrawer } from '@/components/members/MemberDrawer';
import { MembersTable } from '@/components/members/MembersTable';
import { OrgInvitesTable, type InviteActionState } from '@/components/members/OrgInvitesTable';
import { SendNotificationDialog } from '@/components/members/SendNotificationDialog';
import { TableBulkActions } from '@/components/common/TableBulkActions/TableBulkActions';
import styles from './MembersPage.module.css';

type ApiErrorDetails = {
  code?: string;
  message?: string;
  meta?: unknown;
};

type LocationState = {
  bootstrapAttempted?: boolean;
};

type BootstrapState = {
  returnTo?: string;
};

const DEFAULT_LIMIT = 50;
const ACTION_MESSAGE_TIMEOUT_MS = 6000;

type ActionMessage = {
  tone: 'info' | 'error' | 'success';
  text: string;
} | null;

type InviteState = {
  items: InviteWithDecrypted[];
  pagination: Pagination | null;
  availability: SeatAvailability | null;
  loading: boolean;
  error: string | null;
};

export function MembersPage() {
  const { userId: clerkUserId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('members');
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [inviteBadgeCount, setInviteBadgeCount] = useState<number | null>(null);
  const [showAllInvites, setShowAllInvites] = useState(0);
  const [inviteOffset, setInviteOffset] = useState(0);
  const [inviteRefreshToken, setInviteRefreshToken] = useState(0);
  const [inviteActionStates, setInviteActionStates] = useState<Record<string, InviteActionState>>(
    {},
  );
  const [inviteActionMessage, setInviteActionMessage] = useState<ActionMessage>(null);
  const [memberActionMessage, setMemberActionMessage] = useState<ActionMessage>(null);
  const [deactivatedMemberCount, setDeactivatedMemberCount] = useState<number | null>(null);
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [pendingUninvite, setPendingUninvite] = useState<InviteWithDecrypted | null>(null);
  const [pendingBulkUninvite, setPendingBulkUninvite] = useState<InviteWithDecrypted[] | null>(
    null,
  );
  const [selectedMember, setSelectedMember] = useState<MemberWithUser | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [memberSelection, setMemberSelection] = useState<Selection>(new Set());
  const [inviteSelection, setInviteSelection] = useState<Selection>(new Set());
  const [memberBulkBusy, setMemberBulkBusy] = useState(false);
  const [inviteBulkBusy, setInviteBulkBusy] = useState(false);
  const [sendNotificationOpen, setSendNotificationOpen] = useState(false);
  const [sendNotificationLoading, setSendNotificationLoading] = useState(false);
  const [sendNotificationError, setSendNotificationError] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<InviteState>({
    items: [],
    pagination: null,
    availability: null,
    loading: false,
    error: null,
  });
  const invitePagination = inviteState.pagination;

  const locationState = (location.state ?? {}) as LocationState;
  const redirectUrl = `${location.pathname}${location.search}`;

  const pageSummary = useMemo(() => {
    if (!pagination) return null;
    const start = pagination.total === 0 ? 0 : pagination.offset + 1;
    const end = Math.min(pagination.offset + pagination.limit, pagination.total);
    return `Showing ${start}-${end} of ${pagination.total}`;
  }, [pagination]);

  const memberBadge = pagination?.total ?? (loading ? null : members.length);

  const formatBadge = (value: number | null | undefined) =>
    typeof value === 'number' ? String(value) : '—';

  const currentMember = useMemo(
    () => members.find((member) => member.user.clerk_user_id === clerkUserId),
    [clerkUserId, members],
  );

  const canBulkManage = useMemo(() => {
    const role = currentMember?.membership.role;
    if (!role) return false;
    return role === 'admin' || role === 'super_admin';
  }, [currentMember]);

  const selectedMemberIds = useMemo(() => {
    if (memberSelection === 'all') {
      return members.map((member) => member.membership.user_id);
    }
    return Array.from(memberSelection) as string[];
  }, [memberSelection, members]);

  const selectedInviteIds = useMemo(() => {
    if (inviteSelection === 'all') {
      return inviteState.items.map((invite) => invite.id);
    }
    return Array.from(inviteSelection) as string[];
  }, [inviteSelection, inviteState.items]);

  const isMemberSelectionAll = memberSelection === 'all';
  const selectedMemberCount = selectedMemberIds.length;
  const selectedInviteCount = selectedInviteIds.length;

  const bulkUninvitePreview = useMemo(() => {
    if (!pendingBulkUninvite || pendingBulkUninvite.length === 0) return null;
    const preview = pendingBulkUninvite
      .slice(0, 3)
      .map((invite) => invite.email)
      .join(', ');
    const remainder =
      pendingBulkUninvite.length > 3 ? ` +${pendingBulkUninvite.length - 3} more` : '';
    return `${preview}${remainder}`;
  }, [pendingBulkUninvite]);

  const handleInvitesComplete = (results: InviteResult[]) => {
    const successCount = results.filter((result) => !result.error).length;
    setInviteBadgeCount(successCount);
    setRefreshToken((prev) => prev + 1);
    setInviteRefreshToken((prev) => prev + 1);
  };

  useEffect(() => {
    let active = true;

    const loadMembers = async () => {
      setLoading(true);
      setErrorMessage(null);
      setNotFound(false);

      try {
        const response: MemberSummaryResponse = await getMemberSummary({
          limit: DEFAULT_LIMIT,
          offset,
          include_deactivated: includeDeactivated,
        });

        if (!active) return;

        setMembers(response.members?.members ?? []);
        setPagination(response.members?.pagination ?? null);
        setInviteBadgeCount(response.pending_invite_ct ?? 0);
        setDeactivatedMemberCount(response.deactivated_member_ct ?? 0);
      } catch (err) {
        if (!active) return;

        const normalized = err as HttpError | Error | null;
        const httpError = normalized as HttpError;
        const status = httpError?.status;
        const details = (httpError?.details ?? {}) as ApiErrorDetails;
        const code = details?.code;

        if (status === 401) {
          setErrorMessage('We need to reconnect your session to load members.');
          setLoading(false);
          return;
        }

        if (status === 403 && code === 'org_not_bootstrapped') {
          if (!locationState.bootstrapAttempted) {
            navigate('/onboarding/bootstrap', {
              state: { returnTo: redirectUrl } as BootstrapState,
            });
            return;
          }
          setErrorMessage('Organization setup is incomplete. Please contact support.');
          setLoading(false);
          return;
        }

        if (status === 403) {
          setErrorMessage(
            details?.message ?? httpError?.message ?? 'Access to members is forbidden.',
          );
          setLoading(false);
          return;
        }

        if (status === 404) {
          setNotFound(true);
          setErrorMessage('Members could not be found.');
          setLoading(false);
          return;
        }

        if (!status || status >= 500) {
          setErrorMessage('We could not load members right now. Please try again.');
          setLoading(false);
          return;
        }

        setErrorMessage(details?.message ?? httpError?.message ?? 'Unable to load members.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadMembers();

    return () => {
      active = false;
    };
  }, [
    includeDeactivated,
    locationState.bootstrapAttempted,
    navigate,
    offset,
    redirectUrl,
    refreshToken,
  ]);

  useEffect(() => {
    setMemberSelection(new Set());
  }, [members, pagination?.offset]);

  useEffect(() => {
    if (canBulkManage) return;
    setMemberSelection(new Set());
    setInviteSelection(new Set());
  }, [canBulkManage]);

  useEffect(() => {
    if (activeTab !== 'invites') return;
    let active = true;

    const loadInvites = async () => {
      setInviteState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response: InviteSummaryResponse = await getInviteSummary({
          limit: DEFAULT_LIMIT,
          offset: inviteOffset,
        });

        if (!active) return;

        setInviteState({
          items: response.invites?.invites ?? [],
          pagination: response.invites?.pagination ?? null,
          availability: response.availability ?? null,
          loading: false,
          error: null,
        });
        if (typeof response.invites?.pagination?.total === 'number') {
          setInviteBadgeCount(response.invites.pagination.total);
        }
      } catch (err) {
        if (!active) return;

        const normalized = err as HttpError | Error | null;
        const httpError = normalized as HttpError;
        const status = httpError?.status;
        const details = (httpError?.details ?? {}) as ApiErrorDetails;
        const code = details?.code;

        if (status === 401) {
          setInviteState((prev) => ({
            ...prev,
            loading: false,
            error: 'We need to reconnect your session to load invites.',
          }));
          return;
        }

        if (status === 403 && code === 'org_not_bootstrapped') {
          if (!locationState.bootstrapAttempted) {
            navigate('/onboarding/bootstrap', {
              state: { returnTo: redirectUrl } as BootstrapState,
            });
            return;
          }
          setInviteState((prev) => ({
            ...prev,
            loading: false,
            error: 'Organization setup is incomplete. Please contact support.',
          }));
          return;
        }

        if (status === 403) {
          setInviteState((prev) => ({
            ...prev,
            loading: false,
            error: details?.message ?? httpError?.message ?? 'Access to invites is forbidden.',
          }));
          return;
        }

        if (!status || status >= 500) {
          setInviteState((prev) => ({
            ...prev,
            loading: false,
            error: 'We could not load invites right now. Please try again.',
          }));
          return;
        }

        setInviteState((prev) => ({
          ...prev,
          loading: false,
          error: details?.message ?? httpError?.message ?? 'Unable to load invites.',
        }));
      }
    };

    loadInvites();

    return () => {
      active = false;
    };
  }, [
    activeTab,
    inviteOffset,
    inviteRefreshToken,
    locationState.bootstrapAttempted,
    navigate,
    redirectUrl,
  ]);

  useEffect(() => {
    setInviteSelection(new Set());
  }, [inviteState.items, invitePagination?.offset]);

  useEffect(() => {
    if (!inviteActionMessage) return;
    const timer = window.setTimeout(() => setInviteActionMessage(null), ACTION_MESSAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [inviteActionMessage]);

  useEffect(() => {
    if (!memberActionMessage) return;
    const timer = window.setTimeout(() => setMemberActionMessage(null), ACTION_MESSAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [memberActionMessage]);

  useEffect(() => {
    if (deactivatedMemberCount === 0 && includeDeactivated) {
      setIncludeDeactivated(false);
    }
  }, [deactivatedMemberCount, includeDeactivated]);

  const updateInviteActionState = (inviteId: string, next: Partial<InviteActionState>) => {
    setInviteActionStates((prev) => ({
      ...prev,
      [inviteId]: {
        ...prev[inviteId],
        ...next,
      },
    }));
  };

  const openUninviteDialog = (invite: InviteWithDecrypted) => {
    if (inviteActionStates[invite.id]?.error) {
      updateInviteActionState(invite.id, { error: undefined });
    }
    setPendingUninvite(invite);
  };

  const closeUninviteDialog = () => {
    setPendingUninvite(null);
  };

  const handleResendInvite = async (
    invite: InviteWithDecrypted,
    options?: { suppressMessage?: boolean },
  ): Promise<boolean> => {
    const suppressMessage = options?.suppressMessage ?? false;
    setInviteActionMessage(null);
    updateInviteActionState(invite.id, { resending: true, uninviting: false, error: undefined });

    try {
      const updated = await resendInvite(invite.id);
      setInviteState((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === invite.id ? updated : item)),
      }));
      updateInviteActionState(invite.id, { resending: false, uninviting: false, error: undefined });
      if (!suppressMessage) {
        setInviteActionMessage({ tone: 'success', text: 'Invitation resent.' });
      }
      return true;
    } catch (err) {
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const status = httpError?.status;
      const details = (httpError?.details ?? {}) as ApiErrorDetails;
      const code = details?.code;

      if (status === 401) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: 'Reconnect your session to resend invites.',
        });
        return false;
      }

      if (status === 403 && code === 'org_not_bootstrapped') {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: undefined,
        });
        if (!locationState.bootstrapAttempted) {
          navigate('/onboarding/bootstrap', {
            state: { returnTo: redirectUrl } as BootstrapState,
          });
          return false;
        }
        if (!suppressMessage) {
          setInviteActionMessage({
            tone: 'error',
            text: 'Organization setup is incomplete. Please contact support.',
          });
        }
        return false;
      }

      if (status === 403) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: details?.message ?? httpError?.message ?? 'You are not allowed to resend invites.',
        });
        return false;
      }

      if (status === 404 || status === 409) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: undefined,
        });
        if (!suppressMessage) {
          setInviteActionMessage({
            tone: 'info',
            text:
              details?.message ??
              (status === 404
                ? 'Invite no longer exists. Refreshing list...'
                : 'Invite can no longer be resent. Refreshing list...'),
          });
        }
        setInviteRefreshToken((prev) => prev + 1);
        return false;
      }

      if (status === 400) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: details?.message ?? 'Invite resend was rejected.',
        });
        return false;
      }

      if (!status || status >= 500) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: 'Invite resend failed. Please try again.',
        });
        return false;
      }

      updateInviteActionState(invite.id, {
        resending: false,
        uninviting: false,
        error: details?.message ?? httpError?.message ?? 'Unable to resend invite.',
      });
      return false;
    }
  };

  const handleUninviteInvite = async (
    invite: InviteWithDecrypted,
    options?: { suppressMessage?: boolean },
  ): Promise<boolean> => {
    const suppressMessage = options?.suppressMessage ?? false;
    setInviteActionMessage(null);
    updateInviteActionState(invite.id, { resending: false, uninviting: true, error: undefined });

    try {
      await uninviteInvite(invite.id);
      setInviteState((prev) => {
        const nextItems = prev.items.filter((item) => item.id !== invite.id);
        const nextPagination = prev.pagination
          ? { ...prev.pagination, total: Math.max(0, prev.pagination.total - 1) }
          : prev.pagination;
        return {
          ...prev,
          items: nextItems,
          pagination: nextPagination,
        };
      });
      setInviteBadgeCount((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : prev));
      updateInviteActionState(invite.id, { resending: false, uninviting: false, error: undefined });
      if (!suppressMessage) {
        setInviteActionMessage({ tone: 'success', text: 'Invitation revoked.' });
      }
      return true;
    } catch (err) {
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const status = httpError?.status;
      const details = (httpError?.details ?? {}) as ApiErrorDetails;
      const code = details?.code;

      if (status === 401) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: 'Reconnect your session to revoke invites.',
        });
        return false;
      }

      if (status === 403 && code === 'org_not_bootstrapped') {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: undefined,
        });
        if (!locationState.bootstrapAttempted) {
          navigate('/onboarding/bootstrap', {
            state: { returnTo: redirectUrl } as BootstrapState,
          });
          return false;
        }
        if (!suppressMessage) {
          setInviteActionMessage({
            tone: 'error',
            text: 'Organization setup is incomplete. Please contact support.',
          });
        }
        return false;
      }

      if (status === 403) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: details?.message ?? httpError?.message ?? 'You are not allowed to revoke invites.',
        });
        return false;
      }

      if (status === 404 || status === 409) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: undefined,
        });
        if (!suppressMessage) {
          setInviteActionMessage({
            tone: 'info',
            text:
              details?.message ??
              (status === 404
                ? 'Invite no longer exists. Refreshing list...'
                : 'Invite can no longer be revoked. Refreshing list...'),
          });
        }
        setInviteRefreshToken((prev) => prev + 1);
        return false;
      }

      if (status === 400) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: details?.message ?? 'Invite revocation was rejected.',
        });
        return false;
      }

      if (!status || status >= 500) {
        updateInviteActionState(invite.id, {
          resending: false,
          uninviting: false,
          error: 'Invite revocation failed. Please try again.',
        });
        return false;
      }

      updateInviteActionState(invite.id, {
        resending: false,
        uninviting: false,
        error: details?.message ?? httpError?.message ?? 'Unable to revoke invite.',
      });
      return false;
    }
  };

  const confirmUninviteDialog = async () => {
    if (!pendingUninvite) return;
    const success = await handleUninviteInvite(pendingUninvite);
    if (success) {
      setPendingUninvite(null);
    }
  };

  const closeBulkUninviteDialog = () => {
    setPendingBulkUninvite(null);
  };

  const confirmBulkUninviteDialog = async () => {
    if (!pendingBulkUninvite || pendingBulkUninvite.length === 0) return;
    setInviteBulkBusy(true);
    const results = await Promise.all(
      pendingBulkUninvite.map((invite) => handleUninviteInvite(invite, { suppressMessage: true })),
    );
    const successCount = results.filter(Boolean).length;
    const failureCount = results.length - successCount;
    if (successCount && failureCount === 0) {
      setInviteActionMessage({
        tone: 'success',
        text: `Cancelled ${successCount} invitation${successCount === 1 ? '' : 's'}.`,
      });
    } else if (successCount && failureCount) {
      setInviteActionMessage({
        tone: 'error',
        text: `Cancelled ${successCount} invitations. ${failureCount} failed.`,
      });
    } else if (failureCount) {
      setInviteActionMessage({ tone: 'error', text: 'Unable to cancel invitations.' });
    }
    setInviteBulkBusy(false);
    setPendingBulkUninvite(null);
    setInviteSelection(new Set());
  };

  const handleBulkResendInvites = async () => {
    const selectedInvites = inviteState.items.filter((invite) =>
      selectedInviteIds.includes(invite.id),
    );
    const pendingInvites = selectedInvites.filter((invite) => invite.status === 'pending');

    if (pendingInvites.length === 0) {
      setInviteActionMessage({ tone: 'info', text: 'Select at least one pending invite.' });
      return;
    }

    setInviteBulkBusy(true);
    const results = await Promise.all(
      pendingInvites.map((invite) => handleResendInvite(invite, { suppressMessage: true })),
    );
    const successCount = results.filter(Boolean).length;
    const failureCount = results.length - successCount;

    if (successCount && failureCount === 0) {
      setInviteActionMessage({
        tone: 'success',
        text: `Resent ${successCount} invitation${successCount === 1 ? '' : 's'}.`,
      });
    } else if (successCount && failureCount) {
      setInviteActionMessage({
        tone: 'error',
        text: `Resent ${successCount} invitations. ${failureCount} failed.`,
      });
    } else if (failureCount) {
      setInviteActionMessage({ tone: 'error', text: 'Unable to resend invitations.' });
    }

    setInviteBulkBusy(false);
    setInviteSelection(new Set());
  };

  const openBulkUninviteDialog = () => {
    const selectedInvites = inviteState.items.filter((invite) =>
      selectedInviteIds.includes(invite.id),
    );
    const pendingInvites = selectedInvites.filter((invite) => invite.status === 'pending');
    if (pendingInvites.length === 0) {
      setInviteActionMessage({ tone: 'info', text: 'Select at least one pending invite.' });
      return;
    }
    setPendingBulkUninvite(pendingInvites);
  };

  const closeSendNotificationDialog = () => {
    if (sendNotificationLoading) return;
    setSendNotificationOpen(false);
    setSendNotificationError(null);
  };

  const openSendNotificationDialog = () => {
    setSendNotificationError(null);
    setSendNotificationOpen(true);
  };

  const handleSendNotification = async (payload: { subject: string; body: string }) => {
    if (selectedMemberIds.length === 0) {
      setSendNotificationError('Select at least one member to notify.');
      return;
    }

    setSendNotificationLoading(true);
    setSendNotificationError(null);
    setMemberActionMessage(null);

    try {
      const response = await sendNotification({
        recipient_ids: selectedMemberIds,
        subject: payload.subject,
        body: payload.body,
        channel: 'email',
      });
      const failedCount = response.failed?.length ?? 0;
      if (failedCount > 0) {
        setMemberActionMessage({
          tone: 'error',
          text: `Sent ${response.sent_count} notifications. ${failedCount} failed.`,
        });
      } else {
        setMemberActionMessage({
          tone: 'success',
          text: `Notification sent to ${response.sent_count} member${
            response.sent_count === 1 ? '' : 's'
          }.`,
        });
      }
      setSendNotificationOpen(false);
      setMemberSelection(new Set());
    } catch (err) {
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const status = httpError?.status;
      const details = (httpError?.details ?? {}) as ApiErrorDetails;
      const code = details?.code;

      if (status === 401) {
        setSendNotificationError('Reconnect your session to send notifications.');
        return;
      }

      if (status === 403 && code === 'org_not_bootstrapped') {
        if (!locationState.bootstrapAttempted) {
          navigate('/onboarding/bootstrap', {
            state: { returnTo: redirectUrl } as BootstrapState,
          });
          return;
        }
        setSendNotificationError('Organization setup is incomplete. Please contact support.');
        return;
      }

      if (status === 403) {
        setSendNotificationError(
          details?.message ?? httpError?.message ?? 'You are not allowed to send notifications.',
        );
        return;
      }

      if (!status || status >= 500) {
        setSendNotificationError('Notification failed. Please try again.');
        return;
      }

      setSendNotificationError(details?.message ?? httpError?.message ?? 'Unable to send email.');
    } finally {
      setSendNotificationLoading(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportMembers = async () => {
    setMemberBulkBusy(true);
    setMemberActionMessage(null);

    try {
      const response = await exportMembers({
        member_ids:
          isMemberSelectionAll || selectedMemberIds.length === 0 ? null : selectedMemberIds,
        filters: {},
      });
      downloadBlob(response.blob, response.filename ?? 'members-export.csv');
      setMemberActionMessage({ tone: 'success', text: 'Export ready.' });
      setMemberSelection(new Set());
    } catch (err) {
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const status = httpError?.status;
      const details = (httpError?.details ?? {}) as ApiErrorDetails;
      const code = details?.code;

      if (status === 401) {
        setMemberActionMessage({
          tone: 'error',
          text: 'Reconnect your session to export members.',
        });
        return;
      }

      if (status === 403 && code === 'org_not_bootstrapped') {
        if (!locationState.bootstrapAttempted) {
          navigate('/onboarding/bootstrap', {
            state: { returnTo: redirectUrl } as BootstrapState,
          });
          return;
        }
        setMemberActionMessage({
          tone: 'error',
          text: 'Organization setup is incomplete. Please contact support.',
        });
        return;
      }

      if (status === 403) {
        setMemberActionMessage({
          tone: 'error',
          text: details?.message ?? httpError?.message ?? 'You are not allowed to export members.',
        });
        return;
      }

      if (!status || status >= 500) {
        setMemberActionMessage({ tone: 'error', text: 'Export failed. Please try again.' });
        return;
      }

      setMemberActionMessage({
        tone: 'error',
        text: details?.message ?? httpError?.message ?? 'Unable to export members.',
      });
    } finally {
      setMemberBulkBusy(false);
    }
  };

  const handleMemberRowAction = (member: MemberWithUser) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
  };

  const handleIncludeDeactivatedChange = (nextValue: boolean) => {
    setIncludeDeactivated(nextValue);
    setOffset(0);
  };

  const handleMemberUpdated = () => {
    setRefreshToken((prev) => prev + 1);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedMember(null);
  };

  return (
    <section className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Members</h1>
          <p className={styles.pageHint}>
            Keep track of active teammates and recent invite activity.
          </p>
        </div>
      </div>
      <Tabs
        className={styles.tabs}
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key))}
      >
        <TabList aria-label="Members sections" className={styles.tabList}>
          <Tab id="members" className={styles.tab}>
            <span>Members</span>
            <span className={styles.badge}>{formatBadge(memberBadge)}</span>
          </Tab>
          <Tab id="invites" className={styles.tab}>
            <span>Invites</span>
            <span className={styles.badge}>{formatBadge(inviteBadgeCount)}</span>
          </Tab>
        </TabList>
        <TabPanel id="members" className={styles.tabPanel}>
          <MemberDrawer
            isOpen={isDrawerOpen}
            member={selectedMember}
            viewerRole={currentMember?.membership.role ?? null}
            onClose={closeDrawer}
            onMemberUpdated={handleMemberUpdated}
            onActionMessage={setMemberActionMessage}
          />
          <SendNotificationDialog
            key={sendNotificationOpen ? 'send-open' : 'send-closed'}
            isOpen={sendNotificationOpen}
            recipientCount={selectedMemberCount}
            loading={sendNotificationLoading}
            error={sendNotificationError}
            onSend={handleSendNotification}
            onClose={closeSendNotificationDialog}
          />
          {errorMessage ? (
            <div>
              <p role="alert">{errorMessage}</p>
              {!notFound && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onPress={() => setRefreshToken((prev) => prev + 1)}
                >
                  Retry
                </Button>
              )}
            </div>
          ) : null}
          {memberActionMessage ? <p role="status">{memberActionMessage.text}</p> : null}
          {deactivatedMemberCount && deactivatedMemberCount > 0 ? (
            <div className={styles.deactivatedWarning} role="status">
              <strong className={styles.deactivatedWarningTitle}>Deactivated members</strong>
              <p className={styles.deactivatedWarningText}>
                {deactivatedMemberCount} member{deactivatedMemberCount === 1 ? '' : 's'} are
                deactivated. Reactivating a member consumes a seat, so ensure seats are available.
              </p>
              <label className={styles.deactivatedToggle}>
                <input
                  type="checkbox"
                  checked={includeDeactivated}
                  onChange={(event) => handleIncludeDeactivatedChange(event.target.checked)}
                />
                <span>Include deactivated members</span>
              </label>
            </div>
          ) : null}
          {loading && !errorMessage ? (
            <MembersTable
              members={[]}
              loading
              currentUserId={clerkUserId}
              selection={
                canBulkManage
                  ? { selectedKeys: memberSelection, onSelectionChange: setMemberSelection }
                  : undefined
              }
            />
          ) : null}
          {!loading && !errorMessage && members.length === 0 ? <p>No members found yet.</p> : null}
          {!loading && !errorMessage && members.length > 0 ? (
            <>
              {pageSummary ? <p>{pageSummary}</p> : null}
              {canBulkManage && selectedMemberCount > 0 ? (
                <TableBulkActions
                  count={selectedMemberCount}
                  itemLabel="member"
                  onClear={() => setMemberSelection(new Set())}
                  actions={[
                    {
                      label: 'Send Notification',
                      onPress: openSendNotificationDialog,
                      variant: 'primary',
                      isDisabled: memberBulkBusy || sendNotificationLoading,
                    },
                    {
                      label: 'Export',
                      onPress: handleExportMembers,
                      variant: 'outline',
                      isDisabled: memberBulkBusy || sendNotificationLoading,
                    },
                  ]}
                />
              ) : null}
              <MembersTable
                members={members}
                currentUserId={clerkUserId}
                onRowAction={handleMemberRowAction}
                selection={
                  canBulkManage
                    ? {
                        selectedKeys: memberSelection,
                        onSelectionChange: setMemberSelection,
                      }
                    : undefined
                }
              />
            </>
          ) : null}
          {pagination && !loading && !errorMessage ? (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <Button
                type="button"
                variant="outline"
                isDisabled={pagination.offset === 0}
                onPress={() => setOffset(Math.max(0, pagination.offset - pagination.limit))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                isDisabled={pagination.offset + pagination.limit >= pagination.total}
                onPress={() => setOffset(pagination.offset + pagination.limit)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </TabPanel>
        <TabPanel id="invites" className={styles.tabPanel}>
          <ConfirmDialog
            isOpen={Boolean(pendingUninvite)}
            title="Revoke invite?"
            description="This will cancel the invitation immediately."
            details={pendingUninvite ? <div>{pendingUninvite.email}</div> : null}
            confirmLabel="Revoke invite"
            cancelLabel="Cancel"
            loading={
              pendingUninvite
                ? (inviteActionStates[pendingUninvite.id]?.uninviting ?? false)
                : false
            }
            error={pendingUninvite ? (inviteActionStates[pendingUninvite.id]?.error ?? null) : null}
            onConfirm={confirmUninviteDialog}
            onCancel={closeUninviteDialog}
          />
          <ConfirmDialog
            isOpen={Boolean(pendingBulkUninvite && pendingBulkUninvite.length > 0)}
            title="Cancel invitations?"
            description={
              pendingBulkUninvite
                ? `This will cancel ${pendingBulkUninvite.length} invitation${
                    pendingBulkUninvite.length === 1 ? '' : 's'
                  } immediately.`
                : undefined
            }
            details={bulkUninvitePreview ? <div>{bulkUninvitePreview}</div> : null}
            confirmLabel="Cancel invitations"
            cancelLabel="Keep invites"
            loading={inviteBulkBusy}
            onConfirm={confirmBulkUninviteDialog}
            onCancel={closeBulkUninviteDialog}
          />
          <div className={styles.inviteHeader}>
            <div>
              <h2>Invites</h2>
              <p className={styles.pageHint}>
                Send new invitations and review the latest invite activity.
              </p>
            </div>
            <BatchInviteTrigger onInvitesComplete={handleInvitesComplete} />
          </div>
          {inviteActionMessage ? <p role="status">{inviteActionMessage.text}</p> : null}
          <div className={styles.filterBar}>
            <div className={styles.filterCopy}>
              <strong>Filters</strong>
              <span className={styles.filterHint}>Placeholder controls coming soon.</span>
            </div>
            <Slider
              className={styles.slider}
              minValue={0}
              maxValue={1}
              step={1}
              value={showAllInvites}
              onChange={setShowAllInvites}
              aria-label="Show all invites"
            >
              <div className={styles.sliderHeader}>
                <span>Show all</span>
                <span className={styles.sliderValue}>{showAllInvites ? 'On' : 'Off'}</span>
              </div>
              <SliderTrack className={styles.sliderTrack}>
                {({ state, isDisabled }) => (
                  <>
                    <div
                      className={styles.sliderRail}
                      data-disabled={isDisabled ? 'true' : undefined}
                    />
                    <div
                      className={styles.sliderFill}
                      style={{ width: `${state.getThumbPercent(0) * 100}%` }}
                    />
                    <SliderThumb index={0} className={styles.sliderThumb} />
                  </>
                )}
              </SliderTrack>
            </Slider>
          </div>
          {inviteState.availability ? (
            <div className={styles.availability}>
              <div>
                <strong>Seats</strong>
                <div className={styles.availabilityHint}>
                  {inviteState.availability.seat_usage} used of{' '}
                  {inviteState.availability.seat_limit}
                </div>
              </div>
              <div className={styles.availabilityValue}>
                {inviteState.availability.available} available
              </div>
            </div>
          ) : null}
          {inviteState.loading ? <p>Loading invites...</p> : null}
          {inviteState.error ? (
            <div>
              <p role="alert">{inviteState.error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onPress={() => setInviteRefreshToken((prev) => prev + 1)}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {!inviteState.loading && !inviteState.error && inviteState.items.length === 0 ? (
            <p>No pending invites yet.</p>
          ) : null}
          {!inviteState.loading && !inviteState.error && inviteState.items.length > 0 ? (
            <>
              {invitePagination ? (
                <p>
                  Showing {invitePagination.total === 0 ? 0 : invitePagination.offset + 1}-
                  {Math.min(
                    invitePagination.offset + invitePagination.limit,
                    invitePagination.total,
                  )}{' '}
                  of {invitePagination.total}
                </p>
              ) : null}
              {canBulkManage && selectedInviteCount > 0 ? (
                <TableBulkActions
                  count={selectedInviteCount}
                  itemLabel="invite"
                  onClear={() => setInviteSelection(new Set())}
                  actions={[
                    {
                      label: 'Resend Invitations',
                      onPress: handleBulkResendInvites,
                      variant: 'primary',
                      isDisabled: inviteBulkBusy,
                    },
                    {
                      label: 'Cancel Invitations',
                      onPress: openBulkUninviteDialog,
                      variant: 'outline',
                      isDisabled: inviteBulkBusy,
                    },
                  ]}
                />
              ) : null}
              <OrgInvitesTable
                invites={inviteState.items}
                actionStates={inviteActionStates}
                onResend={handleResendInvite}
                onUninvite={openUninviteDialog}
                selection={
                  canBulkManage
                    ? {
                        selectedKeys: inviteSelection,
                        onSelectionChange: setInviteSelection,
                      }
                    : undefined
                }
              />
            </>
          ) : null}
          {invitePagination && !inviteState.loading && !inviteState.error ? (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <Button
                type="button"
                variant="outline"
                isDisabled={invitePagination.offset === 0}
                onPress={() =>
                  setInviteOffset(Math.max(0, invitePagination.offset - invitePagination.limit))
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                isDisabled={
                  invitePagination.offset + invitePagination.limit >= invitePagination.total
                }
                onPress={() => setInviteOffset(invitePagination.offset + invitePagination.limit)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </TabPanel>
      </Tabs>
    </section>
  );
}
