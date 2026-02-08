import styles from './MembersTable.module.css';

type MemberRoleBadgeProps = {
  role: string;
};

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

export function MemberRoleBadge({ role }: MemberRoleBadgeProps) {
  return <span className={`${styles.tableBadge} ${styles.roleBadge}`}>{formatRole(role)}</span>;
}
