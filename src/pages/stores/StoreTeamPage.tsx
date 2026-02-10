import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useParams } from 'react-router-dom';
import {
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  Radio,
  RadioGroup,
  TextField,
  type Key,
  type Selection,
} from 'react-aria-components';
import { HttpError } from '../../services/http';
import {
  addMemberStoreAssignment,
  listStoreMembers,
  listMembers,
  type MemberWithUser,
  type Pagination,
  removeMemberStoreAssignment,
  sendNotification,
  type StoreMembersResponse,
} from '../../services/membership';
import { Button } from '@/components/common/Button/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog/ConfirmDialog';
import { TableBulkActions } from '@/components/common/TableBulkActions/TableBulkActions';
import { SendNotificationDialog } from '@/components/members/SendNotificationDialog';
import { StoreMemberDrawer } from '@/components/store-members/StoreMemberDrawer';
import { StoreMembersTable } from '@/components/store-members/StoreMembersTable';
import { StoreTabContent } from './StoreTabContent';
import styles from './StoreTeamPage.module.css';

type ActionMessage = {
  tone: 'info' | 'error' | 'success';
  text: string;
} | null;

const DEFAULT_ROLE_OPTIONS = ['super_admin', 'admin', 'accountant', 'staff'];
const ORG_MEMBERS_PAGE_LIMIT = 200;

function normalizeRole(role: string | null | undefined) {
  if (!role) return null;
  return role.replace(/^org:/, '').toLowerCase();
}

function isAdminRole(role: string | null | undefined) {
  if (!role) return false;
  return role === 'admin' || role === 'super_admin';
}

function formatRoleLabel(role: string) {
  return role
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function normalizeStoreMembersResponse(
  response: StoreMembersResponse | MemberWithUser[] | null | undefined,
): MemberWithUser[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.members)) return response.members;
  const nested = response.members as { members?: MemberWithUser[] } | undefined;
  if (nested && Array.isArray(nested.members)) return nested.members;
  const maybeData = response as { data?: MemberWithUser[] };
  if (Array.isArray(maybeData.data)) return maybeData.data;
  return [];
}

function getMemberDisplayName(member: MemberWithUser) {
  const first = member.user.first_name?.trim();
  const last = member.user.last_name?.trim();
  const fullName = [first, last].filter(Boolean).join(' ');
  if (fullName) return fullName;
  if (member.user.email) return member.user.email;
  return 'Unnamed member';
}

function getMemberEmail(member: MemberWithUser) {
  return member.user.email ?? 'No email on file';
}

function getMemberSearchValue(member: MemberWithUser) {
  const name = getMemberDisplayName(member);
  const role = normalizeRole(member.membership.role) ?? '';
  return [name, member.user.email, role].filter(Boolean).join(' ');
}

export function StoreTeamPage() {
  const { storeId } = useParams();
  const { orgRole, userId: clerkUserId } = useAuth();

  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [memberSelection, setMemberSelection] = useState<Selection>(new Set());
  const [selectedMember, setSelectedMember] = useState<MemberWithUser | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const [orgMembers, setOrgMembers] = useState<MemberWithUser[]>([]);
  const [orgMembersPagination, setOrgMembersPagination] = useState<Pagination | null>(null);
  const [orgMembersLoading, setOrgMembersLoading] = useState(false);
  const [orgMembersError, setOrgMembersError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedOrgMemberId, setSelectedOrgMemberId] = useState<string | null>(null);
  const [pendingAddMember, setPendingAddMember] = useState<MemberWithUser | null>(null);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[] | null>(null);
  const [pendingRemoveSnapshot, setPendingRemoveSnapshot] = useState<MemberWithUser[]>([]);
  const [assignActionError, setAssignActionError] = useState<string | null>(null);
  const [assignActionLoading, setAssignActionLoading] = useState(false);
  const [assignFormError, setAssignFormError] = useState<string | null>(null);
  const [notificationRecipients, setNotificationRecipients] = useState<string[]>([]);
  const [clearSelectionOnSend, setClearSelectionOnSend] = useState(false);
  const [sendNotificationOpen, setSendNotificationOpen] = useState(false);
  const [sendNotificationLoading, setSendNotificationLoading] = useState(false);
  const [sendNotificationError, setSendNotificationError] = useState<string | null>(null);

  const normalizedRole = normalizeRole(orgRole ?? null);
  const isAdmin = isAdminRole(normalizedRole);

  useEffect(() => {
    if (!storeId) {
      setMembers([]);
      setLoading(false);
      setErrorMessage('Missing store identifier.');
      return;
    }

    let active = true;
    setLoading(true);
    setErrorMessage(null);
    setMembers([]);

    listStoreMembers(storeId)
      .then((data) => {
        if (!active) return;
        setMembers(normalizeStoreMembersResponse(data));
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(getErrorMessage(error, 'Unable to load store members.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [storeId, refreshToken]);

  useEffect(() => {
    if (!isAdmin || !storeId) {
      setOrgMembers([]);
      setOrgMembersPagination(null);
      setOrgMembersError(null);
      setOrgMembersLoading(false);
      return;
    }

    let active = true;
    setOrgMembersLoading(true);
    setOrgMembersError(null);

    listMembers({ limit: ORG_MEMBERS_PAGE_LIMIT, offset: 0 })
      .then((response) => {
        if (!active) return;
        setOrgMembers(response.members ?? []);
        setOrgMembersPagination(response.pagination ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setOrgMembersError(getErrorMessage(error, 'Unable to load organization members.'));
      })
      .finally(() => {
        if (active) setOrgMembersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, storeId]);

  useEffect(() => {
    setMemberSelection(new Set());
  }, [roleFilter, searchValue]);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  useEffect(() => {
    setSearchValue('');
    setRoleFilter('all');
    setMemberSelection(new Set());
    setNotificationRecipients([]);
    setClearSelectionOnSend(false);
    setSelectedMember(null);
    setIsDrawerOpen(false);
    setMemberQuery('');
    setSelectedOrgMemberId(null);
    setPendingAddMember(null);
    setPendingRemoveIds(null);
    setPendingRemoveSnapshot([]);
    setAssignActionError(null);
    setAssignActionLoading(false);
    setAssignFormError(null);
  }, [storeId]);

  const roleOptions = useMemo(() => {
    const discovered = new Set<string>();
    members.forEach((member) => {
      const role = normalizeRole(member.membership.role);
      if (role) discovered.add(role);
    });

    const extras = Array.from(discovered).filter((role) => !DEFAULT_ROLE_OPTIONS.includes(role));
    const combined = [...DEFAULT_ROLE_OPTIONS, ...extras.sort()];

    return [
      { value: 'all', label: 'All roles' },
      ...combined.map((role) => ({ value: role, label: formatRoleLabel(role) })),
    ];
  }, [members]);

  const filteredMembers = useMemo(() => {
    const normalizedFilter = roleFilter === 'all' ? null : roleFilter;
    const query = searchValue.trim().toLowerCase();

    return members.filter((member) => {
      const role = normalizeRole(member.membership.role);
      if (normalizedFilter && role !== normalizedFilter) return false;
      if (!query) return true;
      const name = [member.user.first_name, member.user.last_name].filter(Boolean).join(' ');
      const searchable = [name, member.user.email, role].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(query);
    });
  }, [members, roleFilter, searchValue]);

  const summaryText = useMemo(() => {
    const total = members.length;
    const visible = filteredMembers.length;
    if (total === 0) return null;
    if (total === visible) return `${total} member${total === 1 ? '' : 's'}`;
    return `Showing ${visible} of ${total} members`;
  }, [filteredMembers.length, members.length]);

  const selectedMemberIds = useMemo(() => {
    if (memberSelection === 'all') {
      return filteredMembers.map((member) => member.membership.user_id);
    }
    return Array.from(memberSelection) as string[];
  }, [filteredMembers, memberSelection]);

  const selectedMemberCount = selectedMemberIds.length;
  const notificationRecipientCount = notificationRecipients.length;

  const assignedMemberIds = useMemo(() => {
    return new Set(members.map((member) => member.membership.user_id));
  }, [members]);

  const availableOrgMembers = useMemo(() => {
    return orgMembers.filter((member) => !assignedMemberIds.has(member.membership.user_id));
  }, [assignedMemberIds, orgMembers]);

  const selectedOrgMember = useMemo(() => {
    if (!selectedOrgMemberId) return null;
    return availableOrgMembers.find((member) => member.membership.user_id === selectedOrgMemberId);
  }, [availableOrgMembers, selectedOrgMemberId]);

  useEffect(() => {
    if (!selectedOrgMemberId) return;
    const stillAvailable = availableOrgMembers.some(
      (member) => member.membership.user_id === selectedOrgMemberId,
    );
    if (!stillAvailable) {
      setSelectedOrgMemberId(null);
      setMemberQuery('');
    }
  }, [availableOrgMembers, selectedOrgMemberId]);

  const pendingRemoveMembers = useMemo(() => {
    if (pendingRemoveSnapshot.length > 0) return pendingRemoveSnapshot;
    if (!pendingRemoveIds || pendingRemoveIds.length === 0) return [];
    const target = new Set(pendingRemoveIds);
    return members.filter((member) => target.has(member.membership.user_id));
  }, [members, pendingRemoveIds, pendingRemoveSnapshot]);

  const removePreview = useMemo(() => {
    if (!pendingRemoveMembers.length) return null;
    const names = pendingRemoveMembers.map(getMemberDisplayName);
    const preview = names.slice(0, 3).join(', ');
    if (names.length <= 3) return preview;
    return `${preview} +${names.length - 3} more`;
  }, [pendingRemoveMembers]);

  const orgMembersTruncated =
    (orgMembersPagination?.total ?? 0) > ORG_MEMBERS_PAGE_LIMIT ? true : false;
  const hasAvailableOrgMembers = availableOrgMembers.length > 0;
  const disableAssignControls =
    !isAdmin || !storeId || orgMembersLoading || assignActionLoading || !hasAvailableOrgMembers;
  const disableAddAction = assignActionLoading || !selectedOrgMemberId;

  const showEmptyState = !loading && !errorMessage && members.length === 0;
  const showNoMatches =
    !loading && !errorMessage && members.length > 0 && filteredMembers.length === 0;

  const openSendNotificationDialog = (recipients: string[], shouldClearSelection: boolean) => {
    setNotificationRecipients(recipients);
    setClearSelectionOnSend(shouldClearSelection);
    setSendNotificationError(null);
    setSendNotificationOpen(true);
  };

  const closeSendNotificationDialog = () => {
    if (sendNotificationLoading) return;
    setSendNotificationOpen(false);
    setSendNotificationError(null);
    setNotificationRecipients([]);
    setClearSelectionOnSend(false);
  };

  const handleSendNotification = async (payload: { subject: string; body: string }) => {
    if (notificationRecipients.length === 0) {
      setSendNotificationError('Select at least one member to notify.');
      return;
    }

    setSendNotificationLoading(true);
    setSendNotificationError(null);
    setActionMessage(null);

    try {
      const response = await sendNotification({
        recipient_ids: notificationRecipients,
        subject: payload.subject,
        body: payload.body,
        channel: 'email',
      });
      const failedCount = response.failed?.length ?? 0;
      if (failedCount > 0) {
        setActionMessage({
          tone: 'error',
          text: `Sent ${response.sent_count} notifications. ${failedCount} failed.`,
        });
      } else {
        setActionMessage({
          tone: 'success',
          text: `Notification sent to ${response.sent_count} member${
            response.sent_count === 1 ? '' : 's'
          }.`,
        });
      }
      setSendNotificationOpen(false);
      setNotificationRecipients([]);
      if (clearSelectionOnSend) {
        setMemberSelection(new Set());
      }
    } catch (error) {
      const httpError = error as HttpError | Error | null;
      if (httpError && (httpError as HttpError).status === 401) {
        setSendNotificationError('Reconnect your session to send notifications.');
        return;
      }
      if (httpError && (httpError as HttpError).status === 403) {
        setSendNotificationError(
          getErrorMessage(error, 'You are not allowed to send notifications.'),
        );
        return;
      }
      setSendNotificationError(getErrorMessage(error, 'Notification failed. Please try again.'));
    } finally {
      setSendNotificationLoading(false);
    }
  };

  const handleAssignSelectionChange = (key: Key | null) => {
    const selected = key != null ? String(key) : null;
    setSelectedOrgMemberId(selected);
    if (selected) {
      const member = availableOrgMembers.find((item) => item.membership.user_id === selected);
      setMemberQuery(member ? getMemberDisplayName(member) : '');
    }
    setAssignFormError(null);
  };

  const handleRequestAddMember = () => {
    if (!selectedOrgMember) {
      setAssignFormError('Select a member to add.');
      return;
    }
    setAssignFormError(null);
    setAssignActionError(null);
    setPendingAddMember(selectedOrgMember);
  };

  const handleCancelAddMember = () => {
    if (assignActionLoading) return;
    setPendingAddMember(null);
    setAssignActionError(null);
  };

  const handleConfirmAddMember = async () => {
    if (!pendingAddMember || !storeId) return;
    const memberToAdd = pendingAddMember;
    const previousMembers = members;

    if (assignedMemberIds.has(memberToAdd.membership.user_id)) {
      setAssignActionError('This member is already assigned to the store.');
      return;
    }

    setAssignActionLoading(true);
    setAssignActionError(null);
    setMembers((prev) => [...prev, memberToAdd]);

    try {
      await addMemberStoreAssignment(memberToAdd.membership.user_id, storeId);
      setActionMessage({
        tone: 'success',
        text: `Added ${getMemberDisplayName(memberToAdd)} to this store.`,
      });
      setPendingAddMember(null);
      setSelectedOrgMemberId(null);
      setMemberQuery('');
    } catch (error) {
      setMembers(previousMembers);
      setAssignActionError(getErrorMessage(error, 'Unable to add member to this store.'));
    } finally {
      setAssignActionLoading(false);
    }
  };

  const handleRequestRemoveMembers = () => {
    if (selectedMemberIds.length === 0) {
      setActionMessage({ tone: 'info', text: 'Select members to remove from this store.' });
      return;
    }
    setAssignActionError(null);
    setPendingRemoveSnapshot(
      members.filter((member) => selectedMemberIds.includes(member.membership.user_id)),
    );
    setPendingRemoveIds(selectedMemberIds);
  };

  const handleCancelRemoveMembers = () => {
    if (assignActionLoading) return;
    setPendingRemoveIds(null);
    setPendingRemoveSnapshot([]);
    setAssignActionError(null);
  };

  const handleConfirmRemoveMembers = async () => {
    if (!storeId || !pendingRemoveIds || pendingRemoveIds.length === 0) return;
    const removedIds = new Set(pendingRemoveIds);
    const previousMembers = members;

    setAssignActionLoading(true);
    setAssignActionError(null);
    setMembers((prev) => prev.filter((member) => !removedIds.has(member.membership.user_id)));
    setMemberSelection(new Set());

    const results = await Promise.allSettled(
      pendingRemoveIds.map((memberId) => removeMemberStoreAssignment(memberId, storeId)),
    );
    const failedIds = results
      .map((result, index) => ({ result, memberId: pendingRemoveIds[index] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ memberId }) => memberId)
      .filter((memberId): memberId is string => typeof memberId === 'string');

    if (failedIds.length > 0) {
      const failedSet = new Set(failedIds);
      const restored = previousMembers.filter(
        (member) =>
          !removedIds.has(member.membership.user_id) || failedSet.has(member.membership.user_id),
      );
      setMembers(restored);
      setPendingRemoveSnapshot(
        previousMembers.filter((member) => failedSet.has(member.membership.user_id)),
      );
      setAssignActionError('Some removals failed. Please try again.');
      setActionMessage({
        tone: 'error',
        text: `Removed ${
          pendingRemoveIds.length - failedIds.length
        } member${pendingRemoveIds.length - failedIds.length === 1 ? '' : 's'}. ${failedIds.length} failed.`,
      });
      setPendingRemoveIds(failedIds);
      setAssignActionLoading(false);
      return;
    }

    setActionMessage({
      tone: 'success',
      text: `Removed ${pendingRemoveIds.length} member${
        pendingRemoveIds.length === 1 ? '' : 's'
      } from this store.`,
    });
    setPendingRemoveIds(null);
    setPendingRemoveSnapshot([]);
    setAssignActionLoading(false);
  };

  const handleMemberRowAction = (member: MemberWithUser) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedMember(null);
  };

  const handleDrawerSendNotification = (member: MemberWithUser) => {
    openSendNotificationDialog([member.membership.user_id], false);
  };

  const handleRetry = () => {
    setRefreshToken((prev) => prev + 1);
  };

  return (
    <div className={styles.page}>
      <StoreTabContent title="Team" description="Manage store members and assignments here." />

      <StoreMemberDrawer
        isOpen={isDrawerOpen}
        member={selectedMember}
        storeId={storeId}
        onClose={closeDrawer}
        canSendNotification={isAdmin}
        onSendNotification={handleDrawerSendNotification}
      />
      <SendNotificationDialog
        key={sendNotificationOpen ? 'send-open' : 'send-closed'}
        isOpen={sendNotificationOpen}
        recipientCount={notificationRecipientCount}
        loading={sendNotificationLoading}
        error={sendNotificationError}
        onSend={handleSendNotification}
        onClose={closeSendNotificationDialog}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingAddMember)}
        title={
          pendingAddMember
            ? `Add ${getMemberDisplayName(pendingAddMember)} to this store?`
            : 'Add member to this store?'
        }
        description="This grants access to store orders and team views."
        confirmLabel="Add member"
        onConfirm={handleConfirmAddMember}
        onCancel={handleCancelAddMember}
        loading={assignActionLoading}
        error={assignActionError}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingRemoveIds && pendingRemoveIds.length > 0)}
        title={
          pendingRemoveIds && pendingRemoveIds.length === 1 && pendingRemoveMembers[0]
            ? `Remove ${getMemberDisplayName(pendingRemoveMembers[0])}?`
            : `Remove ${pendingRemoveIds?.length ?? 0} members from this store?`
        }
        description="They will immediately lose access to store orders and team activity."
        details={removePreview ? <p>{removePreview}</p> : undefined}
        confirmLabel={pendingRemoveIds?.length === 1 ? 'Remove member' : 'Remove members'}
        onConfirm={handleConfirmRemoveMembers}
        onCancel={handleCancelRemoveMembers}
        loading={assignActionLoading}
        error={assignActionError}
      />

      {isAdmin ? (
        <section className={styles.assignPanel} aria-label="Assign members">
          <div className={styles.assignHeader}>
            <div>
              <h3 className={styles.assignTitle}>Assign members</h3>
              <p className={styles.assignHint}>Add existing organization members to this store.</p>
            </div>
          </div>
          <div className={styles.assignControls}>
            <ComboBox<MemberWithUser>
              aria-label="Add member to store"
              items={availableOrgMembers}
              inputValue={memberQuery}
              onInputChange={(value) => {
                setMemberQuery(value);
                if (!value) setSelectedOrgMemberId(null);
                setAssignFormError(null);
              }}
              selectedKey={selectedOrgMemberId ?? undefined}
              onSelectionChange={handleAssignSelectionChange}
              allowsEmptyCollection
              isDisabled={disableAssignControls}
              className={styles.comboBox}
            >
              <div className={styles.comboRow}>
                <Input
                  className={styles.comboInput}
                  placeholder={
                    orgMembersLoading
                      ? 'Loading members...'
                      : hasAvailableOrgMembers
                        ? 'Search members'
                        : 'All members assigned'
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={styles.comboButton}
                  aria-label="Toggle members list"
                  isDisabled={disableAssignControls}
                >
                  v
                </Button>
              </div>
              <Popover className={styles.comboPopover} placement="bottom start">
                <ListBox<MemberWithUser> className={styles.comboListBox}>
                  {(member) => (
                    <ListBoxItem
                      id={member.membership.user_id}
                      textValue={getMemberSearchValue(member)}
                      className={styles.comboItem}
                    >
                      <div className={styles.comboItemMeta}>
                        <span className={styles.comboItemName}>{getMemberDisplayName(member)}</span>
                        <span className={styles.comboItemEmail}>{getMemberEmail(member)}</span>
                      </div>
                      <span className={styles.comboItemRole}>
                        {formatRoleLabel(normalizeRole(member.membership.role) ?? 'member')}
                      </span>
                    </ListBoxItem>
                  )}
                </ListBox>
              </Popover>
            </ComboBox>
            <div className={styles.assignActions}>
              <Button
                type="button"
                size="sm"
                onPress={handleRequestAddMember}
                isDisabled={disableAddAction}
              >
                Add to store
              </Button>
            </div>
          </div>
          {assignFormError ? (
            <p role="alert" className={styles.assignError}>
              {assignFormError}
            </p>
          ) : null}
          {orgMembersError ? (
            <p role="alert" className={styles.assignError}>
              {orgMembersError}
            </p>
          ) : null}
          {orgMembersTruncated ? (
            <p className={styles.assignHint}>
              Showing the first {ORG_MEMBERS_PAGE_LIMIT} members. Refine your search if needed.
            </p>
          ) : null}
          {!orgMembersLoading && !orgMembersError && !hasAvailableOrgMembers ? (
            <p className={styles.assignHint}>All organization members are already assigned.</p>
          ) : null}
        </section>
      ) : null}

      <div className={styles.controls}>
        <TextField
          aria-label="Search store members"
          value={searchValue}
          onChange={setSearchValue}
          className={styles.searchField}
        >
          <Input className={styles.searchInput} placeholder="Search by name or email" />
        </TextField>

        <RadioGroup
          aria-label="Filter members by org role"
          value={roleFilter}
          onChange={(value) => setRoleFilter(String(value))}
          className={styles.filterGroup}
        >
          {roleOptions.map((option) => (
            <Radio key={option.value} value={option.value} className={styles.filterOption}>
              {option.label}
            </Radio>
          ))}
        </RadioGroup>
      </div>

      {summaryText ? (
        <div className={styles.summary}>
          <span className={styles.summaryText}>{summaryText}</span>
        </div>
      ) : null}

      {actionMessage ? (
        <div className={styles.actionMessage} data-tone={actionMessage.tone} role="status">
          {actionMessage.text}
        </div>
      ) : null}

      {errorMessage ? (
        <div className={styles.statePanel} role="alert">
          <h2 className={styles.stateTitle}>Unable to load store members</h2>
          <p className={styles.stateText}>{errorMessage}</p>
          <Button variant="outline" size="sm" onPress={handleRetry}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading && !errorMessage ? (
        <StoreMembersTable
          members={[]}
          loading
          currentUserId={clerkUserId}
          selection={
            isAdmin
              ? {
                  selectedKeys: memberSelection,
                  onSelectionChange: setMemberSelection,
                }
              : undefined
          }
        />
      ) : null}

      {showEmptyState ? (
        <div className={styles.statePanel}>
          <h2 className={styles.stateTitle}>No members assigned yet</h2>
          <p className={styles.stateText}>Add existing org members to this store to get started.</p>
        </div>
      ) : null}

      {showNoMatches ? (
        <div className={styles.statePanel}>
          <h2 className={styles.stateTitle}>No members match your search</h2>
          <p className={styles.stateText}>Try a different name or role filter.</p>
        </div>
      ) : null}

      {!loading && !errorMessage && filteredMembers.length > 0 ? (
        <>
          {isAdmin && selectedMemberCount > 0 ? (
            <TableBulkActions
              count={selectedMemberCount}
              itemLabel="member"
              onClear={() => setMemberSelection(new Set())}
              actions={[
                {
                  label: 'Send Notification',
                  onPress: () => openSendNotificationDialog(selectedMemberIds, true),
                  variant: 'primary',
                  isDisabled: sendNotificationLoading || assignActionLoading,
                },
                {
                  label: 'Remove from store',
                  onPress: handleRequestRemoveMembers,
                  variant: 'outline',
                  isDisabled: assignActionLoading,
                },
              ]}
            />
          ) : null}
          <StoreMembersTable
            members={filteredMembers}
            currentUserId={clerkUserId}
            onRowAction={handleMemberRowAction}
            selection={
              isAdmin
                ? {
                    selectedKeys: memberSelection,
                    onSelectionChange: setMemberSelection,
                  }
                : undefined
            }
          />
        </>
      ) : null}
    </div>
  );
}
