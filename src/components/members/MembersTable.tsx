import { type Key } from 'react';
import {
  Cell,
  Column,
  Row,
  type Selection,
  Table,
  TableBody,
  TableHeader,
} from 'react-aria-components';
import { MemberWithUser } from '../../services/membership';
import { MemberRoleBadge } from './MemberRoleBadge';
import { MemberStatusBadge } from './MemberStatusBadge';
import { SelectionCheckbox } from '../common/SelectionCheckbox/SelectionCheckbox';
import { formatDate, formatRelativeTime } from '../../utils/date';
import styles from './MembersTable.module.css';

type MembersTableProps = {
  members: MemberWithUser[];
  loading?: boolean;
  currentUserId?: string | null;
  onRowAction?: (member: MemberWithUser) => void;
  selection?: {
    selectedKeys: Selection;
    onSelectionChange: (keys: Selection) => void;
  };
};

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

function getInitials(member: MemberWithUser) {
  const first = member.user.first_name?.trim()?.[0];
  const last = member.user.last_name?.trim()?.[0];
  const email = member.user.email?.trim()?.[0];
  const initials = [first, last].filter(Boolean).join('');
  if (initials) return initials.toUpperCase();
  if (email) return email.toUpperCase();
  return '?';
}

function isSelfMember(member: MemberWithUser, clerkUserId: string | null | undefined) {
  if (!clerkUserId) return false;
  return member.user.clerk_user_id === clerkUserId;
}

const skeletonRows = Array.from({ length: 6 }, (_, index) => ({
  id: `skeleton-${index}`,
}));

export function MembersTable({
  members,
  loading = false,
  currentUserId,
  onRowAction,
  selection,
}: MembersTableProps) {
  const enableSelection = Boolean(selection);

  const handleRowAction = (key: Key) => {
    if (!onRowAction) return;
    const member = members.find((item) => item.membership.user_id === key);
    if (member) {
      onRowAction(member);
    }
  };

  return (
    <Table
      aria-label="Members"
      className={styles.table}
      selectionMode={enableSelection ? 'multiple' : undefined}
      selectedKeys={enableSelection ? selection?.selectedKeys : undefined}
      onSelectionChange={enableSelection ? selection?.onSelectionChange : undefined}
      onRowAction={loading || !onRowAction ? undefined : handleRowAction}
    >
      <TableHeader>
        {enableSelection ? (
          <Column className={styles.checkboxCell}>
            <SelectionCheckbox slot="selection" label="Select all members" />
          </Column>
        ) : null}
        <Column isRowHeader>Member</Column>
        <Column>Email</Column>
        <Column>Role</Column>
        <Column>Status</Column>
        <Column>Last Active</Column>
        <Column>Joined</Column>
      </TableHeader>
      {loading ? (
        <TableBody items={skeletonRows}>
          {(row) => (
            <Row id={row.id}>
              {enableSelection ? (
                <Cell className={styles.checkboxCell}>
                  <SelectionCheckbox slot="selection" label="Select member" isDisabled />
                </Cell>
              ) : null}
              <Cell>
                <div className={styles.skeletonRow}>
                  <div className={styles.skeletonCircle} aria-hidden="true" />
                  <div className={styles.skeletonBar} style={{ width: '60%' }} />
                </div>
              </Cell>
              <Cell>
                <div className={styles.skeletonBar} style={{ width: '65%' }} />
              </Cell>
              <Cell>
                <div className={styles.skeletonBar} style={{ width: '55%' }} />
              </Cell>
              <Cell>
                <div className={styles.skeletonBar} style={{ width: '45%' }} />
              </Cell>
              <Cell>
                <div className={styles.skeletonBar} style={{ width: '50%' }} />
              </Cell>
              <Cell>
                <div className={styles.skeletonBar} style={{ width: '40%' }} />
              </Cell>
            </Row>
          )}
        </TableBody>
      ) : (
        <TableBody items={members}>
          {(member) => {
            const displayName = getDisplayName(member);
            const isSelf = isSelfMember(member, currentUserId);

            return (
              <Row
                id={member.membership.user_id}
                className={onRowAction ? styles.rowClickable : undefined}
              >
                {enableSelection ? (
                  <Cell className={styles.checkboxCell}>
                    <SelectionCheckbox slot="selection" label={`Select ${displayName}`} />
                  </Cell>
                ) : null}
                <Cell>
                  <div className={styles.memberCell}>
                    <div className={styles.avatar} aria-hidden="true">
                      {getInitials(member)}
                    </div>
                    <div className={styles.memberMeta}>
                      <span className={styles.memberName}>{displayName}</span>
                      {isSelf ? <span className={styles.selfBadge}>You</span> : null}
                    </div>
                  </div>
                </Cell>
                <Cell>{getEmail(member)}</Cell>
                <Cell>
                  <MemberRoleBadge role={member.membership.role} />
                </Cell>
                <Cell>
                  <MemberStatusBadge status={member.membership.status} />
                </Cell>
                <Cell>{formatRelativeTime(member.user.last_active_at ?? null)}</Cell>
                <Cell>{formatDate(member.membership.created_at)}</Cell>
              </Row>
            );
          }}
        </TableBody>
      )}
    </Table>
  );
}
