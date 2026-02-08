import { useEffect, useMemo, useState } from 'react';
import {
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  type Key,
  Select,
  SelectValue,
  TextField,
  Tooltip,
  TooltipTrigger,
} from 'react-aria-components';
import { HttpError } from '../../services/http';
import {
  addMemberStoreAssignment,
  listMemberStoreAssignments,
  type MemberDetail,
  type MemberRole,
  type MemberStoreAssignment,
  type MembershipRecord,
  removeMemberStoreAssignment,
  updateMemberEmail,
  updateMemberRole,
} from '../../services/membership';
import { listStores, type Store } from '../../services/stores';
import { Button } from '../common/Button/Button';
import { ConfirmDialog } from '../common/ConfirmDialog/ConfirmDialog';
import styles from './AdminProfileExtensions.module.css';

type AdminProfileExtensionsProps = {
  member: MemberDetail;
  viewerRole?: MemberRole | null;
  displayName: string;
  onMemberDetailUpdate: (member: MemberDetail) => void;
  onMembershipUpdate: (membership: MembershipRecord) => void;
  onAssignmentsUpdate: (assignments: MemberStoreAssignment[]) => void;
};

const ROLE_OPTIONS: MemberRole[] = ['admin', 'staff', 'accountant'];

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

function canAssignRole(viewerRole: MemberRole | null | undefined, targetRole: MemberRole) {
  if (targetRole === 'super_admin') return false;
  if (viewerRole === 'super_admin') return true;
  if (viewerRole === 'admin') return targetRole === 'staff' || targetRole === 'accountant';
  return false;
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function InfoIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function AdminProfileExtensions({
  member,
  viewerRole,
  displayName,
  onMemberDetailUpdate,
  onMembershipUpdate,
  onAssignmentsUpdate,
}: AdminProfileExtensionsProps) {
  const memberId = member.membership.user_id;
  const isSelf = member.is_self ?? false;
  const isTargetSuperAdmin = member.membership.role === 'super_admin';
  const canManageMembers = viewerRole === 'admin' || viewerRole === 'super_admin';

  const [roleValue, setRoleValue] = useState(member.membership.role);
  const [pendingRole, setPendingRole] = useState<MemberRole | null>(null);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [emailEditing, setEmailEditing] = useState(false);
  const [emailValue, setEmailValue] = useState(member.user.email ?? '');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<MemberStoreAssignment[]>(
    member.store_assignments ?? [],
  );
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);

  const [showAddStore, setShowAddStore] = useState(false);
  const [storeQuery, setStoreQuery] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [storeActionError, setStoreActionError] = useState<string | null>(null);
  const [storeActionPending, setStoreActionPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPendingRole(null);
    setRoleConfirmOpen(false);
    setRoleError(null);
    setEmailEditing(false);
    setPendingEmail(null);
    setEmailConfirmOpen(false);
    setEmailError(null);
    setAssignmentsError(null);
    setStoreActionError(null);
    setSelectedStoreId(null);
    setStoreQuery('');
    setShowAddStore(false);
    setStoreActionPending(new Set());
  }, [memberId]);

  useEffect(() => {
    setRoleValue(member.membership.role);
  }, [member.membership.role]);

  useEffect(() => {
    setEmailValue(member.user.email ?? '');
  }, [member.user.email]);

  useEffect(() => {
    setAssignments(member.store_assignments ?? []);
  }, [member.store_assignments]);

  useEffect(() => {
    if (!canManageMembers) return;
    let active = true;
    setStoresLoading(true);
    setStoresError(null);

    listStores()
      .then((data) => {
        if (!active) return;
        setStores(data ?? []);
      })
      .catch((error) => {
        if (!active) return;
        setStoresError(getErrorMessage(error, 'Unable to load stores.'));
      })
      .finally(() => {
        if (active) setStoresLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canManageMembers]);

  useEffect(() => {
    if (!canManageMembers || !memberId) return;
    let active = true;
    setAssignmentsLoading(true);
    setAssignmentsError(null);

    listMemberStoreAssignments(memberId)
      .then((data) => {
        if (!active) return;
        setAssignments(data ?? []);
        onAssignmentsUpdate(data ?? []);
      })
      .catch((error) => {
        if (!active) return;
        setAssignmentsError(getErrorMessage(error, 'Unable to load store assignments.'));
      })
      .finally(() => {
        if (active) setAssignmentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canManageMembers, memberId, onAssignmentsUpdate]);

  const roleOptions = useMemo(() => {
    const options: { id: MemberRole; label: string; disabled: boolean }[] = [];
    const seen = new Set<MemberRole>();
    const currentRole = member.membership.role;
    const candidates = [...ROLE_OPTIONS, currentRole];

    candidates.forEach((role) => {
      if (!role || role === 'super_admin' || seen.has(role)) return;
      seen.add(role);
      const assignable = canAssignRole(viewerRole, role);
      if (!assignable && role !== currentRole) return;
      options.push({ id: role, label: formatRole(role), disabled: !assignable });
    });

    return options;
  }, [member.membership.role, viewerRole]);

  const roleDisabledReason = isSelf
    ? 'You cannot change your own role'
    : isTargetSuperAdmin
      ? 'Use Transfer Ownership to change the organization owner'
      : null;
  const isRoleDisabled = Boolean(roleDisabledReason) || roleSaving || roleOptions.length === 0;

  const handleRoleChange = (value: Key | null) => {
    if (value == null) return;
    const nextRole = value as MemberRole;
    if (nextRole === roleValue) return;
    setRoleValue(nextRole);
    setPendingRole(nextRole);
    setRoleConfirmOpen(true);
    setRoleError(null);
  };

  const handleConfirmRole = async () => {
    if (!pendingRole) return;
    setRoleSaving(true);
    setRoleError(null);
    try {
      const updated = await updateMemberRole(memberId, pendingRole);
      onMembershipUpdate(updated);
      setRoleConfirmOpen(false);
      setPendingRole(null);
      setRoleValue(updated.role);
    } catch (error) {
      setRoleError(getErrorMessage(error, 'Unable to update role.'));
      setRoleValue(member.membership.role);
    } finally {
      setRoleSaving(false);
    }
  };

  const handleCancelRole = () => {
    setRoleConfirmOpen(false);
    setPendingRole(null);
    setRoleValue(member.membership.role);
    setRoleError(null);
  };

  const roleHelpText = !roleOptions.length
    ? 'No roles available to assign.'
    : 'Changes apply immediately and update permissions.';

  const isEmailDisabled = emailSaving;

  const handleStartEmailEdit = () => {
    if (isEmailDisabled) return;
    setEmailEditing(true);
    setEmailValue(member.user.email ?? '');
    setEmailError(null);
  };

  const handleCancelEmailEdit = () => {
    setEmailEditing(false);
    setEmailValue(member.user.email ?? '');
    setEmailError(null);
    setPendingEmail(null);
    setEmailConfirmOpen(false);
  };

  const handleCancelEmailConfirm = () => {
    setEmailConfirmOpen(false);
    setPendingEmail(null);
  };

  const handlePrepareEmailSave = () => {
    const trimmed = emailValue.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    setPendingEmail(trimmed);
    setEmailConfirmOpen(true);
  };

  const handleConfirmEmail = async () => {
    if (!pendingEmail) return;
    setEmailSaving(true);
    setEmailError(null);
    try {
      const updated = await updateMemberEmail(memberId, pendingEmail);
      onMemberDetailUpdate(updated);
      setEmailConfirmOpen(false);
      setEmailEditing(false);
      setPendingEmail(null);
      setEmailValue(updated.user.email ?? pendingEmail);
    } catch (error) {
      setEmailError(getErrorMessage(error, 'Unable to update email.'));
      setEmailConfirmOpen(false);
    } finally {
      setEmailSaving(false);
    }
  };

  const availableStores = useMemo(() => {
    const assigned = new Set(assignments.map((assignment) => assignment.store_id));
    return [...stores]
      .filter((store) => !assigned.has(store.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, stores]);

  const isStoreAddDisabled =
    storesLoading || !availableStores.length || storeActionPending.size > 0;

  const setPendingForStore = (storeId: string, pending: boolean) => {
    setStoreActionPending((prev) => {
      const next = new Set(prev);
      if (pending) {
        next.add(storeId);
      } else {
        next.delete(storeId);
      }
      return next;
    });
  };

  const handleAddStore = async () => {
    if (!selectedStoreId) return;
    const store = availableStores.find((item) => item.id === selectedStoreId);
    if (!store) return;

    setStoreActionError(null);
    setPendingForStore(store.id, true);

    const previous = assignments;
    const optimistic: MemberStoreAssignment = {
      store_id: store.id,
      store_name: store.name,
      assigned_at: null,
    };
    const nextAssignments = [...assignments, optimistic];
    setAssignments(nextAssignments);
    onAssignmentsUpdate(nextAssignments);

    try {
      const created = await addMemberStoreAssignment(memberId, store.id);
      const normalized = {
        ...optimistic,
        ...created,
        store_name: created.store_name ?? store.name,
      };
      setAssignments((current) =>
        current.map((assignment) => (assignment.store_id === store.id ? normalized : assignment)),
      );
      onAssignmentsUpdate(
        nextAssignments.map((assignment) =>
          assignment.store_id === store.id ? normalized : assignment,
        ),
      );
      setSelectedStoreId(null);
      setStoreQuery('');
      setShowAddStore(false);
    } catch (error) {
      setAssignments(previous);
      onAssignmentsUpdate(previous);
      setStoreActionError(getErrorMessage(error, 'Unable to add store assignment.'));
    } finally {
      setPendingForStore(store.id, false);
    }
  };

  const handleRemoveStore = async (storeId: string) => {
    setStoreActionError(null);
    setPendingForStore(storeId, true);

    const previous = assignments;
    const nextAssignments = assignments.filter((assignment) => assignment.store_id !== storeId);
    setAssignments(nextAssignments);
    onAssignmentsUpdate(nextAssignments);

    try {
      await removeMemberStoreAssignment(memberId, storeId);
    } catch (error) {
      setAssignments(previous);
      onAssignmentsUpdate(previous);
      setStoreActionError(getErrorMessage(error, 'Unable to remove store assignment.'));
    } finally {
      setPendingForStore(storeId, false);
    }
  };

  if (!canManageMembers) return null;

  return (
    <div className={styles.stack}>
      <section className={styles.panel} aria-label="Role management">
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Role</h3>
          <p className={styles.sectionHint}>Update organization permissions for this member.</p>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelWrap}>
            <span className={styles.fieldLabel}>Role</span>
            {roleDisabledReason ? (
              <TooltipTrigger>
                <span className={styles.infoBadge} tabIndex={0} aria-label={roleDisabledReason}>
                  <InfoIcon className={styles.infoIcon} />
                </span>
                <Tooltip className={styles.tooltip}>{roleDisabledReason}</Tooltip>
              </TooltipTrigger>
            ) : null}
          </div>
          <div className={styles.fieldControl}>
            <Select
              aria-label="Member role"
              value={roleValue}
              onChange={handleRoleChange}
              isDisabled={isRoleDisabled}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={styles.selectTrigger}
                isDisabled={isRoleDisabled}
              >
                <SelectValue className={styles.selectValue}>
                  {({ selectedText }) => selectedText || formatRole(roleValue)}
                </SelectValue>
                <span aria-hidden="true" className={styles.selectCaret}>
                  v
                </span>
              </Button>
              <Popover className={styles.selectPopover} placement="bottom start">
                <ListBox className={styles.listBox}>
                  {roleOptions.map((role) => (
                    <ListBoxItem
                      key={role.id}
                      id={role.id}
                      textValue={role.label}
                      className={styles.listItem}
                      isDisabled={role.disabled}
                    >
                      {role.label}
                    </ListBoxItem>
                  ))}
                </ListBox>
              </Popover>
            </Select>
            <p className={styles.fieldHint}>{roleHelpText}</p>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-label="Email management">
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Email</h3>
          <p className={styles.sectionHint}>Change the primary login email for this member.</p>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelWrap}>
            <span className={styles.fieldLabel}>Email</span>
          </div>
          <div className={styles.fieldControl}>
            {emailEditing ? (
              <div className={styles.inlineEdit}>
                <TextField
                  aria-label="Update email"
                  value={emailValue}
                  onChange={setEmailValue}
                  isDisabled={emailSaving}
                  isInvalid={Boolean(emailError)}
                >
                  <Input
                    className={`${styles.textInput} ${emailError ? styles.inputError : ''}`}
                    type="email"
                    placeholder="member@example.com"
                  />
                </TextField>
                <div className={styles.inlineActions}>
                  <Button
                    type="button"
                    size="sm"
                    onPress={handlePrepareEmailSave}
                    isDisabled={emailSaving}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onPress={handleCancelEmailEdit}
                    isDisabled={emailSaving}
                  >
                    Cancel
                  </Button>
                </div>
                {emailError ? (
                  <p role="alert" className={styles.errorText}>
                    {emailError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className={styles.readOnlyRow}>
                <span className={styles.readOnlyValue}>
                  {member.user.email ?? 'No email on file'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onPress={handleStartEmailEdit}
                  isDisabled={isEmailDisabled}
                >
                  Edit
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-label="Store assignments">
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Store assignments</h3>
          <p className={styles.sectionHint}>Manage which stores this member can access.</p>
        </div>
        <div className={styles.storeListWrap}>
          {assignmentsLoading && !assignments.length ? (
            <p className={styles.fieldHint}>Loading assignments...</p>
          ) : null}
          {assignmentsError ? (
            <p role="alert" className={styles.errorText}>
              {assignmentsError}
            </p>
          ) : null}
          {assignments.length ? (
            <ul className={styles.storeList}>
              {assignments.map((assignment) => (
                <li key={assignment.store_id} className={styles.storeRow}>
                  <span>{assignment.store_name}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={styles.removeButton}
                    onPress={() => handleRemoveStore(assignment.store_id)}
                    isDisabled={storeActionPending.has(assignment.store_id)}
                    aria-label={`Remove ${assignment.store_name}`}
                  >
                    x
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.fieldHint}>No store assignments yet.</p>
          )}
        </div>

        <div className={styles.storeActions}>
          {storesError ? (
            <p role="alert" className={styles.errorText}>
              {storesError}
            </p>
          ) : null}
          {storeActionError ? (
            <p role="alert" className={styles.errorText}>
              {storeActionError}
            </p>
          ) : null}
          {showAddStore ? (
            <div className={styles.addStoreForm}>
              <ComboBox<Store>
                aria-label="Add store"
                items={availableStores}
                inputValue={storeQuery}
                onInputChange={(value) => {
                  setStoreQuery(value);
                  if (!value) setSelectedStoreId(null);
                }}
                selectedKey={selectedStoreId ?? undefined}
                onSelectionChange={(key) => {
                  const selected = key != null ? String(key) : null;
                  setSelectedStoreId(selected);
                  if (selected) {
                    const selectedStore = availableStores.find((item) => item.id === selected);
                    setStoreQuery(selectedStore?.name ?? '');
                  }
                  setStoreActionError(null);
                }}
                allowsEmptyCollection
                isDisabled={storesLoading || !availableStores.length}
                className={styles.comboBox}
              >
                <div className={styles.comboRow}>
                  <Input
                    className={styles.comboInput}
                    placeholder={storesLoading ? 'Loading stores...' : 'Search stores'}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={styles.comboButton}
                    aria-label="Toggle stores list"
                  >
                    v
                  </Button>
                </div>
                <Popover className={styles.selectPopover} placement="bottom start">
                  <ListBox<Store> className={styles.listBox}>
                    {(store) => (
                      <ListBoxItem id={store.id} textValue={store.name} className={styles.listItem}>
                        {store.name}
                      </ListBoxItem>
                    )}
                  </ListBox>
                </Popover>
              </ComboBox>
              <div className={styles.inlineActions}>
                <Button
                  type="button"
                  size="sm"
                  onPress={handleAddStore}
                  isDisabled={!selectedStoreId || storeActionPending.has(selectedStoreId)}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setShowAddStore(false);
                    setSelectedStoreId(null);
                    setStoreQuery('');
                    setStoreActionError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              {!availableStores.length && !storesLoading ? (
                <p className={styles.fieldHint}>All stores are already assigned.</p>
              ) : null}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={() => setShowAddStore(true)}
              isDisabled={isStoreAddDisabled}
            >
              {storesLoading ? 'Loading stores...' : 'Add to store'}
            </Button>
          )}
        </div>
      </section>

      <ConfirmDialog
        isOpen={roleConfirmOpen}
        title={`Change ${displayName}'s role to ${pendingRole ? formatRole(pendingRole) : ''}?`}
        description="This updates their permissions immediately."
        confirmLabel="Change role"
        onConfirm={handleConfirmRole}
        onCancel={handleCancelRole}
        loading={roleSaving}
        error={roleError}
      />

      <ConfirmDialog
        isOpen={emailConfirmOpen}
        title={`Change ${displayName}'s email?`}
        description="This will change their login email. They will be notified."
        confirmLabel="Change email"
        onConfirm={handleConfirmEmail}
        onCancel={handleCancelEmailConfirm}
        loading={emailSaving}
        error={emailError}
      />
    </div>
  );
}
