import { useEffect, useMemo, useState } from 'react';
import { RedirectToSignIn, useAuth } from '@clerk/clerk-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HttpError } from '../services/http';
import {
  listMembers,
  ListMembersResponse,
  MemberWithUser,
  MemberRole,
  Pagination,
  removeMember,
  updateMemberRole,
} from '../services/membership';
import BatchInvitePanel from '@/components/members/BatchInvitePanel';
import { ConfirmDialog } from '@/components/common/ConfirmDialog/ConfirmDialog';

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
const ROLE_OPTIONS: MemberRole[] = ['super_admin', 'admin', 'staff', 'accountant'];
const ACTION_MESSAGE_TIMEOUT_MS = 6000;

type RoleUpdateState = {
  draftRole: string;
  saving: boolean;
  error?: string;
};

type DeleteState = {
  deleting: boolean;
  error?: string;
};

type ActionMessage = {
  tone: 'info' | 'error' | 'success';
  text: string;
} | null;

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

function getDisplayName(member: MemberWithUser) {
  const first = member.user.first_name?.trim();
  const last = member.user.last_name?.trim();
  const fullName = [first, last].filter(Boolean).join(' ');
  if (fullName) return fullName;
  if (member.user.email) return member.user.email;
  return 'Unnamed member';
}

function getEmail(member: MemberWithUser) {
  return member.user.email ?? 'No email on file';
}

function isValidRole(role: string) {
  return ROLE_OPTIONS.includes(role as MemberRole);
}

function isSelfMember(member: MemberWithUser, clerkUserId: string | null | undefined) {
  if (!clerkUserId) return false;
  return member.user.clerk_user_id === clerkUserId;
}

function getRoleOptions(currentRole: string) {
  if (isValidRole(currentRole)) {
    return ROLE_OPTIONS.map((role) => ({ value: role, label: formatRole(role), disabled: false }));
  }
  return [
    {
      value: currentRole,
      label: `Unknown (${currentRole})`,
      disabled: true,
    },
    ...ROLE_OPTIONS.map((role) => ({ value: role, label: formatRole(role), disabled: false })),
  ];
}

export function MembersPage() {
  const { userId: clerkUserId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [roleUpdates, setRoleUpdates] = useState<Record<string, RoleUpdateState>>({});
  const [deleteStates, setDeleteStates] = useState<Record<string, DeleteState>>({});
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const [pendingRemoval, setPendingRemoval] = useState<MemberWithUser | null>(null);

  const locationState = (location.state ?? {}) as LocationState;
  const redirectUrl = `${location.pathname}${location.search}`;

  const pageSummary = useMemo(() => {
    if (!pagination) return null;
    const start = pagination.total === 0 ? 0 : pagination.offset + 1;
    const end = Math.min(pagination.offset + pagination.limit, pagination.total);
    return `Showing ${start}-${end} of ${pagination.total}`;
  }, [pagination]);

  useEffect(() => {
    let active = true;

    const loadMembers = async () => {
      setLoading(true);
      setErrorMessage(null);
      setNotFound(false);
      setNeedsAuth(false);

      try {
        const response: ListMembersResponse = await listMembers({
          limit: DEFAULT_LIMIT,
          offset,
        });

        if (!active) return;

        setMembers(response.members ?? []);
        setPagination(response.pagination ?? null);
      } catch (err) {
        if (!active) return;

        const normalized = err as HttpError | Error | null;
        const httpError = normalized as HttpError;
        const status = httpError?.status;
        const details = (httpError?.details ?? {}) as ApiErrorDetails;
        const code = details?.code;

        if (status === 401) {
          setNeedsAuth(true);
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
  }, [locationState.bootstrapAttempted, navigate, offset, redirectUrl, refreshToken]);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), ACTION_MESSAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const updateRoleState = (userId: string, next: RoleUpdateState) => {
    setRoleUpdates((prev) => ({ ...prev, [userId]: next }));
  };

  const updateDeleteState = (userId: string, next: DeleteState) => {
    setDeleteStates((prev) => ({ ...prev, [userId]: next }));
  };

  const handleRoleUpdate = async (member: MemberWithUser, nextRole: string) => {
    setActionMessage(null);
    const userId = member.membership.user_id;
    const currentRole = member.membership.role;

    if (!isValidRole(nextRole)) {
      updateRoleState(userId, {
        draftRole: currentRole,
        saving: false,
        error: 'Select a valid role before saving.',
      });
      return;
    }

    if (nextRole === currentRole) {
      updateRoleState(userId, { draftRole: currentRole, saving: false, error: undefined });
      return;
    }

    updateRoleState(userId, { draftRole: nextRole, saving: true, error: undefined });

    try {
      const updated = await updateMemberRole(userId, nextRole);
      setMembers((prev) =>
        prev.map((item) =>
          item.membership.user_id === userId ? { ...item, membership: updated } : item,
        ),
      );
      updateRoleState(userId, { draftRole: updated.role, saving: false, error: undefined });
    } catch (err) {
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const status = httpError?.status;
      const details = (httpError?.details ?? {}) as ApiErrorDetails;
      const code = details?.code;

      if (status === 401) {
        setNeedsAuth(true);
        updateRoleState(userId, {
          draftRole: currentRole,
          saving: false,
          error: 'Please sign in to update roles.',
        });
        return;
      }

      if (status === 403 && code === 'org_not_bootstrapped') {
        if (!locationState.bootstrapAttempted) {
          updateRoleState(userId, {
            draftRole: currentRole,
            saving: false,
            error: undefined,
          });
          navigate('/onboarding/bootstrap', {
            state: { returnTo: redirectUrl } as BootstrapState,
          });
          return;
        }
        updateRoleState(userId, {
          draftRole: currentRole,
          saving: false,
          error: 'Organization setup is incomplete. Please contact support.',
        });
        return;
      }

      if (status === 403) {
        updateRoleState(userId, {
          draftRole: currentRole,
          saving: false,
          error: details?.message ?? httpError?.message ?? 'You are not allowed to change roles.',
        });
        return;
      }

      if (status === 404) {
        updateRoleState(userId, {
          draftRole: currentRole,
          saving: false,
          error: details?.message ?? 'Member no longer exists. Refresh to continue.',
        });
        return;
      }

      if (status === 400) {
        updateRoleState(userId, {
          draftRole: currentRole,
          saving: false,
          error: details?.message ?? 'Role update was rejected.',
        });
        return;
      }

      if (!status || status >= 500) {
        updateRoleState(userId, {
          draftRole: currentRole,
          saving: false,
          error: 'Role update failed. Please try again.',
        });
        return;
      }

      updateRoleState(userId, {
        draftRole: currentRole,
        saving: false,
        error: details?.message ?? httpError?.message ?? 'Unable to update role.',
      });
    }
  };

  const handleRemoveMember = async (member: MemberWithUser): Promise<boolean> => {
    if (isSelfMember(member, clerkUserId)) {
      setActionMessage({ tone: 'info', text: 'You cannot remove your own account.' });
      return false;
    }

    setActionMessage(null);
    const userId = member.membership.user_id;
    updateDeleteState(userId, { deleting: true, error: undefined });

    try {
      await removeMember(userId);
      setMembers((prev) => prev.filter((item) => item.membership.user_id !== userId));
      setPagination((prev) =>
        prev
          ? {
              ...prev,
              total: Math.max(0, prev.total - 1),
            }
          : prev,
      );
      updateDeleteState(userId, { deleting: false, error: undefined });
      setActionMessage({ tone: 'success', text: 'Member removed.' });
      return true;
    } catch (err) {
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const status = httpError?.status;
      const details = (httpError?.details ?? {}) as ApiErrorDetails;
      const code = details?.code;

      if (status === 401) {
        setNeedsAuth(true);
        updateDeleteState(userId, {
          deleting: false,
          error: 'Please sign in to remove members.',
        });
        return false;
      }

      if (status === 403 && code === 'org_not_bootstrapped') {
        updateDeleteState(userId, { deleting: false, error: undefined });
        if (!locationState.bootstrapAttempted) {
          navigate('/onboarding/bootstrap', {
            state: { returnTo: redirectUrl } as BootstrapState,
          });
          return false;
        }
        setActionMessage({
          tone: 'error',
          text: 'Organization setup is incomplete. Please contact support.',
        });
        return false;
      }

      if (status === 403) {
        updateDeleteState(userId, {
          deleting: false,
          error: details?.message ?? httpError?.message ?? 'You are not allowed to remove members.',
        });
        return false;
      }

      if (status === 404) {
        updateDeleteState(userId, { deleting: false, error: undefined });
        setActionMessage({
          tone: 'info',
          text: details?.message ?? 'Member no longer exists. Refreshing list...',
        });
        setRefreshToken((prev) => prev + 1);
        return true;
      }

      if (status === 400) {
        updateDeleteState(userId, {
          deleting: false,
          error: details?.message ?? 'Member removal was rejected.',
        });
        return false;
      }

      if (!status || status >= 500) {
        updateDeleteState(userId, {
          deleting: false,
          error: 'Member removal failed. Please try again.',
        });
        return false;
      }

      updateDeleteState(userId, {
        deleting: false,
        error: details?.message ?? httpError?.message ?? 'Unable to remove member.',
      });
      return false;
    }
  };

  const openRemovalDialog = (member: MemberWithUser) => {
    if (isSelfMember(member, clerkUserId)) {
      setActionMessage({ tone: 'info', text: 'You cannot remove your own account.' });
      return;
    }
    const userId = member.membership.user_id;
    if (deleteStates[userId]?.error) {
      updateDeleteState(userId, { deleting: false, error: undefined });
    }
    setPendingRemoval(member);
  };

  const closeRemovalDialog = () => {
    setPendingRemoval(null);
  };

  const confirmRemovalDialog = async () => {
    if (!pendingRemoval) return;
    const success = await handleRemoveMember(pendingRemoval);
    if (success) {
      setPendingRemoval(null);
    }
  };

  if (needsAuth) {
    return <RedirectToSignIn redirectUrl={redirectUrl} />;
  }

  return (
    <section>
      <h1>Members</h1>
      <BatchInvitePanel
        onInvitesComplete={() => setRefreshToken((prev) => prev + 1)}
        onAuthRequired={() => setNeedsAuth(true)}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingRemoval)}
        title="Remove member?"
        description="This will immediately revoke access to Ordersight."
        details={
          pendingRemoval ? (
            <div>
              <strong>{getDisplayName(pendingRemoval)}</strong>
              <div>{getEmail(pendingRemoval)}</div>
            </div>
          ) : null
        }
        confirmLabel="Remove member"
        cancelLabel="Cancel"
        loading={
          pendingRemoval
            ? (deleteStates[pendingRemoval.membership.user_id]?.deleting ?? false)
            : false
        }
        error={
          pendingRemoval ? (deleteStates[pendingRemoval.membership.user_id]?.error ?? null) : null
        }
        onConfirm={confirmRemovalDialog}
        onCancel={closeRemovalDialog}
      />
      {actionMessage ? <p role="status">{actionMessage.text}</p> : null}
      {loading ? <p>Loading members...</p> : null}
      {errorMessage ? (
        <div>
          <p role="alert">{errorMessage}</p>
          {!notFound && (
            <button type="button" onClick={() => setRefreshToken((prev) => prev + 1)}>
              Retry
            </button>
          )}
        </div>
      ) : null}
      {!loading && !errorMessage && members.length === 0 ? <p>No members found yet.</p> : null}
      {!loading && !errorMessage && members.length > 0 ? (
        <>
          {pageSummary ? <p>{pageSummary}</p> : null}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.membership.user_id}>
                  <td>{getDisplayName(member)}</td>
                  <td>{getEmail(member)}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <select
                        value={
                          roleUpdates[member.membership.user_id]?.draftRole ??
                          member.membership.role
                        }
                        onChange={(event) => handleRoleUpdate(member, event.target.value)}
                        disabled={roleUpdates[member.membership.user_id]?.saving}
                        aria-label={`Role for ${getDisplayName(member)}`}
                      >
                        {getRoleOptions(member.membership.role).map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {roleUpdates[member.membership.user_id]?.saving ? (
                        <span>Saving...</span>
                      ) : null}
                      {roleUpdates[member.membership.user_id]?.error ? (
                        <span role="alert">{roleUpdates[member.membership.user_id]?.error}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{member.membership.status}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => openRemovalDialog(member)}
                        disabled={
                          deleteStates[member.membership.user_id]?.deleting ||
                          isSelfMember(member, clerkUserId)
                        }
                      >
                        {deleteStates[member.membership.user_id]?.deleting
                          ? 'Removing...'
                          : 'Remove'}
                      </button>
                      {isSelfMember(member, clerkUserId) ? (
                        <span>You cannot remove yourself.</span>
                      ) : null}
                      {deleteStates[member.membership.user_id]?.error ? (
                        <span role="alert">{deleteStates[member.membership.user_id]?.error}</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {pagination && !loading && !errorMessage ? (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            type="button"
            disabled={pagination.offset === 0}
            onClick={() => setOffset(Math.max(0, pagination.offset - pagination.limit))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={pagination.offset + pagination.limit >= pagination.total}
            onClick={() => setOffset(pagination.offset + pagination.limit)}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
