import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HttpError } from '../../services/http';
import {
  InviteRequest,
  InviteResult,
  InviteWithDecrypted,
  MemberRole,
  inviteMembers,
} from '../../services/membership';
import styles from './BatchInvitePanel.module.css';

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

type DraftErrors = {
  email?: string;
  role?: string;
};

type InviteDraft = {
  id: string;
  email: string;
  role: MemberRole;
};

type InviteOutcome = {
  id: string;
  email: string;
  role: MemberRole;
  invite?: InviteWithDecrypted;
  error?: { code?: string; message: string };
  submittedAt: string;
};

type ExpiryInfo = {
  status: 'ok' | 'near' | 'expired' | 'unknown';
  label: string;
  expiresAt?: string;
  remainingMs?: number;
};

type Props = {
  onInvitesComplete?: (results: InviteResult[]) => void;
  onAuthRequired?: () => void;
};

const ROLE_OPTIONS: MemberRole[] = ['admin', 'staff', 'accountant'];
const DEFAULT_ROLE: MemberRole = 'staff';
const NEAR_EXPIRY_MS = 48 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createDraft = (): InviteDraft => ({
  id: createId(),
  email: '',
  role: DEFAULT_ROLE,
});

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

function normalizeEmail(email: string) {
  return email.trim();
}

function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} hr`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function getExpiryInfo(expiresAt: string | null | undefined, now: number): ExpiryInfo | null {
  if (!expiresAt) return null;
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) {
    return { status: 'unknown', label: 'Expiration time unavailable' };
  }
  const remainingMs = expiryMs - now;
  const expiresAtLabel = new Date(expiryMs).toLocaleString();
  if (remainingMs <= 0) {
    return { status: 'expired', label: 'Invite expired', expiresAt: expiresAtLabel, remainingMs };
  }
  if (remainingMs <= NEAR_EXPIRY_MS) {
    return {
      status: 'near',
      label: `Expires in ${formatDuration(remainingMs)}`,
      expiresAt: expiresAtLabel,
      remainingMs,
    };
  }
  return {
    status: 'ok',
    label: `Expires in ${formatDuration(remainingMs)}`,
    expiresAt: expiresAtLabel,
    remainingMs,
  };
}

function validateDrafts(drafts: InviteDraft[]) {
  const errors: Record<string, DraftErrors> = {};
  const requests: InviteRequest[] = [];
  const requestIds: string[] = [];
  const seen = new Set<string>();

  drafts.forEach((draft) => {
    const email = normalizeEmail(draft.email);
    const role = draft.role?.trim();
    const draftErrors: DraftErrors = {};

    if (!email) {
      draftErrors.email = 'Email is required';
    } else if (!email.includes('@')) {
      draftErrors.email = 'Enter a valid email';
    }

    if (!role) {
      draftErrors.role = 'Role is required';
    }

    const emailKey = email.toLowerCase();
    if (email && seen.has(emailKey)) {
      draftErrors.email = 'Duplicate email in this batch';
    }

    if (Object.keys(draftErrors).length > 0) {
      errors[draft.id] = draftErrors;
      return;
    }

    seen.add(emailKey);
    requests.push({ email, role });
    requestIds.push(draft.id);
  });

  return { errors, requests, requestIds };
}

function mapResults(results: InviteResult[], requestIds: string[]): InviteOutcome[] {
  return results.map((result, index) => ({
    id: requestIds[index] ?? createId(),
    email: result.email,
    role: result.role,
    invite: result.invite,
    error: result.error ? { code: result.error.code, message: result.error.message } : undefined,
    submittedAt: new Date().toISOString(),
  }));
}

export function BatchInvitePanel({ onInvitesComplete, onAuthRequired }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<InviteDraft[]>([createDraft()]);
  const [draftErrors, setDraftErrors] = useState<Record<string, DraftErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<InviteOutcome[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const locationState = (location.state ?? {}) as LocationState;
  const redirectUrl = `${location.pathname}${location.search}`;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    if (outcomes.length === 0) return null;
    const successCount = outcomes.filter((item) => !item.error).length;
    const errorCount = outcomes.filter((item) => item.error).length;
    const nearExpiryCount = outcomes.filter((item) => {
      const expiry = getExpiryInfo(item.invite?.expires_at, now);
      return expiry?.status === 'near';
    }).length;
    return { successCount, errorCount, nearExpiryCount };
  }, [now, outcomes]);

  const updateDraft = (id: string, field: 'email' | 'role', value: string) => {
    setDrafts((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft)),
    );
    if (draftErrors[id]?.[field]) {
      setDraftErrors((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? {}), [field]: undefined },
      }));
    }
  };

  const addDraft = () => {
    setDrafts((prev) => [...prev, createDraft()]);
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((draft) => draft.id !== id);
      return next.length > 0 ? next : [createDraft()];
    });
    setDraftErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const resetForm = () => {
    setDrafts([createDraft()]);
    setDraftErrors({});
    setFormError(null);
    setOutcomes([]);
  };

  const handleAuthRequired = () => {
    if (onAuthRequired) {
      onAuthRequired();
    } else {
      setFormError('Please sign in to continue.');
    }
  };

  const handleInviteError = (err: unknown) => {
    const normalized = err as HttpError | Error | null;
    const httpError = normalized as HttpError;
    const status = httpError?.status;
    const details = (httpError?.details ?? {}) as ApiErrorDetails;
    const code = details?.code;

    if (status === 401) {
      handleAuthRequired();
      return;
    }

    if (status === 403 && code === 'org_not_bootstrapped') {
      if (!locationState.bootstrapAttempted) {
        navigate('/onboarding/bootstrap', {
          state: { returnTo: redirectUrl } as BootstrapState,
        });
        return;
      }
      setFormError('Organization setup is incomplete. Please contact support.');
      return;
    }

    if (status === 403) {
      setFormError(details?.message ?? httpError?.message ?? 'Access to invites is forbidden.');
      return;
    }

    if (status === 409) {
      setFormError(details?.message ?? httpError?.message ?? 'Invite conflict detected.');
      return;
    }

    if (status === 400) {
      setFormError(details?.message ?? httpError?.message ?? 'Check your invite details.');
      return;
    }

    if (!status || status >= 500) {
      setFormError('We could not send invites right now. Please try again.');
      return;
    }

    setFormError(details?.message ?? httpError?.message ?? 'Unable to send invites.');
  };

  const requestInvites = async (requests: InviteRequest[]) => {
    const response = await inviteMembers(requests);
    return Array.isArray(response) ? response : [response];
  };

  const handleSubmit = async () => {
    setFormError(null);
    const { errors, requests, requestIds } = validateDrafts(drafts);
    setDraftErrors(errors);

    if (Object.keys(errors).length > 0) {
      setFormError('Fix the highlighted rows before sending.');
      return;
    }

    if (requests.length === 0) {
      setFormError('Add at least one invite before sending.');
      return;
    }

    try {
      setSubmitting(true);
      const results = await requestInvites(requests);
      setOutcomes(mapResults(results, requestIds));
      onInvitesComplete?.(results);
    } catch (err) {
      handleInviteError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (outcome: InviteOutcome) => {
    if (retryingId) return;
    setFormError(null);
    setRetryingId(outcome.id);
    try {
      const results = await requestInvites([{ email: outcome.email, role: outcome.role }]);
      setOutcomes((prev) => {
        const next = [...prev];
        const index = next.findIndex((item) => item.id === outcome.id);
        const mapped = mapResults(results, [outcome.id]);
        if (index >= 0 && mapped[0]) {
          next[index] = mapped[0];
          return next;
        }
        return [...mapped, ...next];
      });
      onInvitesComplete?.(results);
    } catch (err) {
      handleInviteError(err);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="batch-invite-title">
      <div className={styles.header}>
        <div>
          <h2 id="batch-invite-title">Batch invite</h2>
          <p className={styles.hintText}>
            Send multiple invites in one request. Results show per-invite status for testing.
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={addDraft} disabled={submitting}>
            Add row
          </button>
          <button type="button" onClick={resetForm} disabled={submitting}>
            Clear
          </button>
        </div>
      </div>

      {formError ? (
        <p role="alert" className={styles.errorText}>
          {formError}
        </p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => {
              const errors = draftErrors[draft.id];
              return (
                <tr key={draft.id}>
                  <td>
                    <input
                      className={`${styles.input} ${errors?.email ? styles.inputError : ''}`}
                      type="email"
                      placeholder="member@example.com"
                      value={draft.email}
                      onChange={(event) => updateDraft(draft.id, 'email', event.target.value)}
                    />
                    {errors?.email ? <div className={styles.errorText}>{errors.email}</div> : null}
                  </td>
                  <td>
                    <select
                      className={`${styles.input} ${errors?.role ? styles.inputError : ''}`}
                      value={draft.role}
                      onChange={(event) => updateDraft(draft.id, 'role', event.target.value)}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {formatRole(role)}
                        </option>
                      ))}
                    </select>
                    {errors?.role ? <div className={styles.errorText}>{errors.role}</div> : null}
                  </td>
                  <td className={styles.rowActions}>
                    <button type="button" onClick={() => removeDraft(draft.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Sending invites...' : 'Send batch invites'}
        </button>
        <span className={styles.hintText}>Roles supported: admin, staff, accountant.</span>
      </div>

      {summary ? (
        <div className={styles.summary}>
          <strong>Batch summary:</strong> Sent {summary.successCount} invite
          {summary.successCount === 1 ? '' : 's'}
          {summary.errorCount
            ? `, ${summary.errorCount} error${summary.errorCount === 1 ? '' : 's'}`
            : ''}
          {summary.nearExpiryCount ? `, ${summary.nearExpiryCount} expiring soon` : ''}.
        </div>
      ) : null}

      {outcomes.length ? (
        <div className={styles.results}>
          <h3>Latest results</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {outcomes.map((outcome) => {
                const expiry = getExpiryInfo(outcome.invite?.expires_at, now);
                const canRetry = expiry?.status === 'expired';
                const showRetry = expiry?.status === 'near' || expiry?.status === 'expired';
                const statusText = outcome.error
                  ? outcome.error.message
                  : outcome.invite
                    ? `Invite ${outcome.invite.status}`
                    : 'Invite queued';

                return (
                  <tr key={outcome.id}>
                    <td>{outcome.email}</td>
                    <td>{formatRole(outcome.role)}</td>
                    <td className={outcome.error ? styles.statusError : undefined}>{statusText}</td>
                    <td>
                      {expiry ? (
                        <div>
                          <div>{expiry.label}</div>
                          {expiry.expiresAt ? (
                            <div className={styles.hintText}>({expiry.expiresAt})</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className={styles.hintText}>--</span>
                      )}
                    </td>
                    <td className={styles.rowActions}>
                      {showRetry ? (
                        <button
                          type="button"
                          onClick={() => handleRetry(outcome)}
                          disabled={!canRetry || retryingId === outcome.id || submitting}
                        >
                          {canRetry ? 'Retry invite' : 'Retry after expiration'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
