import {
  Cell,
  Column,
  Row,
  type Selection,
  Table,
  TableBody,
  TableHeader,
} from 'react-aria-components';
import { InviteWithDecrypted } from '../../services/membership';
import { Button } from '../common/Button/Button';
import { MemberRoleBadge } from './MemberRoleBadge';
import { SelectionCheckbox } from '../common/SelectionCheckbox/SelectionCheckbox';
import styles from './OrgInvitesTable.module.css';

export type InviteActionState = {
  resending?: boolean;
  uninviting?: boolean;
  error?: string;
};

type OrgInvitesTableProps = {
  invites: InviteWithDecrypted[];
  actionStates: Record<string, InviteActionState>;
  onResend: (invite: InviteWithDecrypted) => void;
  onUninvite: (invite: InviteWithDecrypted) => void;
  selection?: {
    selectedKeys: Selection;
    onSelectionChange: (keys: Selection) => void;
  };
};

function formatDateTime(value?: string | null) {
  if (!value) return '--';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatStatusLabel(status?: string | null) {
  if (!status) return 'unknown';
  return status.replace(/_/g, ' ').toLowerCase();
}

function getStatusClass(status?: string | null) {
  const normalized = status?.replace(/_/g, ' ').toLowerCase();
  if (!normalized) return styles.statusUnknown;
  if (normalized === 'pending') return styles.statusPending;
  if (normalized === 'accepted' || normalized === 'joined') return styles.statusAccepted;
  if (normalized === 'revoked' || normalized === 'canceled' || normalized === 'cancelled')
    return styles.statusRevoked;
  if (normalized === 'expired') return styles.statusExpired;
  return styles.statusUnknown;
}

export function OrgInvitesTable({
  invites,
  actionStates,
  onResend,
  onUninvite,
  selection,
}: OrgInvitesTableProps) {
  const enableSelection = Boolean(selection);
  const disabledKeys = enableSelection
    ? invites.filter((invite) => invite.status !== 'pending').map((invite) => invite.id)
    : undefined;

  return (
    <Table
      aria-label="Pending invites"
      className={styles.table}
      selectionMode={enableSelection ? 'multiple' : undefined}
      selectedKeys={enableSelection ? selection?.selectedKeys : undefined}
      onSelectionChange={enableSelection ? selection?.onSelectionChange : undefined}
      disabledKeys={disabledKeys}
    >
      <TableHeader>
        {enableSelection ? (
          <Column className={styles.checkboxCell}>
            <SelectionCheckbox slot="selection" label="Select all invitations" />
          </Column>
        ) : null}
        <Column>Email</Column>
        <Column>Role</Column>
        <Column>Invited</Column>
        <Column>Expires</Column>
        <Column>Status</Column>
        <Column>Actions</Column>
      </TableHeader>
      <TableBody items={invites} dependencies={[actionStates]}>
        {(invite) => {
          const actionState = actionStates[invite.id];
          const isPending = invite.status === 'pending';
          const isResending = actionState?.resending ?? false;
          const isUninviting = actionState?.uninviting ?? false;
          const isBusy = isResending || isUninviting;

          return (
            <Row id={invite.id}>
              {enableSelection ? (
                <Cell className={styles.checkboxCell}>
                  <SelectionCheckbox slot="selection" label={`Select ${invite.email}`} />
                </Cell>
              ) : null}
              <Cell>{invite.email}</Cell>
              <Cell>
                <MemberRoleBadge role={invite.role} />
              </Cell>
              <Cell>{formatDateTime(invite.created_at)}</Cell>
              <Cell>{formatDateTime(invite.expires_at)}</Cell>
              <Cell>
                <span
                  className={`${styles.tableBadge} ${styles.statusBadge} ${getStatusClass(
                    invite.status,
                  )}`}
                >
                  {formatStatusLabel(invite.status)}
                </span>
              </Cell>
              <Cell>
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onPress={() => onResend(invite)}
                    isDisabled={!isPending || isBusy}
                  >
                    {isResending ? 'Resending...' : 'Resend'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onPress={() => onUninvite(invite)}
                    isDisabled={!isPending || isBusy}
                  >
                    {isUninviting ? 'Revoking...' : 'Uninvite'}
                  </Button>
                  {actionState?.error ? <span role="alert">{actionState.error}</span> : null}
                </div>
              </Cell>
            </Row>
          );
        }}
      </TableBody>
    </Table>
  );
}
