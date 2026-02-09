import styles from './MembersTable.module.css';

type MemberStatusBadgeProps = {
  status?: string | null;
};

function formatStatusLabel(status?: string | null) {
  if (!status) return 'unknown';
  const normalized = status.replace(/_/g, ' ').toLowerCase();
  if (normalized === 'disabled') return 'deactivated';
  return normalized;
}

function getStatusClass(status?: string | null) {
  const normalized = status?.replace(/_/g, ' ').toLowerCase();
  if (!normalized) return styles.statusUnknown;
  if (normalized === 'active') return styles.statusActive;
  if (normalized === 'disabled' || normalized === 'suspended') return styles.statusSuspended;
  return styles.statusUnknown;
}

export function MemberStatusBadge({ status }: MemberStatusBadgeProps) {
  const label = formatStatusLabel(status);
  const className = getStatusClass(status);

  return <span className={`${styles.tableBadge} ${styles.statusBadge} ${className}`}>{label}</span>;
}
