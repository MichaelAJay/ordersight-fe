import { type ReactNode } from 'react';
import { Tooltip, TooltipTrigger } from 'react-aria-components';
import { type MemberDetail, type MemberWithUser } from '../../services/membership';
import { formatDate, formatDateTime, formatRelativeTime } from '../../utils/date';
import styles from './MemberProfileBase.module.css';

type MemberProfileBaseProps = {
  member: MemberWithUser | MemberDetail;
  memberSinceOverride?: string | null;
};

type DetailRowProps = {
  label: string;
  value: ReactNode;
  action?: ReactNode;
};

type MemberUserWithPhone = MemberWithUser['user'] & {
  phone?: string | null;
  phone_number?: string | null;
};

function DetailRow({ label, value, action }: DetailRowProps) {
  return (
    <div className={styles.detailRow}>
      <div className={styles.label}>{label}</div>
      <div className={styles.valueWrap}>
        <div className={styles.value}>{value}</div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function getDisplayName(member: MemberWithUser | MemberDetail) {
  const first = member.user.first_name?.trim();
  const last = member.user.last_name?.trim();
  const fullName = [first, last].filter(Boolean).join(' ');
  if (fullName) return fullName;
  if (member.user.email) return member.user.email;
  return 'Unnamed member';
}

export function MemberProfileBase({ member, memberSinceOverride }: MemberProfileBaseProps) {
  const user = member.user as MemberUserWithPhone;
  const displayName = getDisplayName(member);
  const email = user.email ?? 'No email on file';
  const phone = user.phone ?? user.phone_number ?? null;
  const phoneValue = phone ?? '--';
  const lastActiveAt = user.last_active_at ?? null;
  const lastActiveRelative = formatRelativeTime(lastActiveAt);
  const lastActiveExact = formatDateTime(lastActiveAt);
  const memberSinceValue =
    memberSinceOverride && memberSinceOverride.trim()
      ? memberSinceOverride
      : member.membership.created_at;
  const memberSince = formatDate(memberSinceValue);

  const nameValue = (
    <span className={styles.valueInline}>
      <span>{displayName}</span>
      <TooltipTrigger>
        <span
          className={styles.lock}
          tabIndex={0}
          aria-label="Name is managed by the user in their account settings"
        >
          <LockIcon className={styles.lockIcon} />
        </span>
        <Tooltip className={styles.tooltip}>
          Name is managed by the user in their account settings
        </Tooltip>
      </TooltipTrigger>
    </span>
  );

  const lastActiveValue = lastActiveAt ? (
    <TooltipTrigger>
      <span className={styles.timeValue} tabIndex={0} aria-label={lastActiveExact}>
        {lastActiveRelative}
      </span>
      <Tooltip className={styles.tooltip}>{lastActiveExact}</Tooltip>
    </TooltipTrigger>
  ) : (
    <span className={styles.placeholder}>--</span>
  );

  return (
    <section className={styles.card} aria-label="Member profile">
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Contact info</h3>
        <p className={styles.sectionHint}>Read-only details from the member's account.</p>
      </div>
      <div className={styles.rows}>
        <DetailRow label="Name" value={nameValue} />
        <DetailRow label="Email" value={email} />
        <DetailRow label="Phone" value={phoneValue} />
        <DetailRow label="Last active" value={lastActiveValue} />
        <DetailRow label="Member since" value={memberSince} />
      </div>
    </section>
  );
}

export type { DetailRowProps };
