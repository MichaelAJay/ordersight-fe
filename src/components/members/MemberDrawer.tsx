import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components';
import { HttpError } from '../../services/http';
import {
  getMemberDetail,
  type MemberDetail,
  type MemberRole,
  type MemberStatus,
  type MemberWithUser,
} from '../../services/membership';
import { Button } from '../common/Button/Button';
import { MemberRoleBadge } from './MemberRoleBadge';
import { MemberStatusBadge } from './MemberStatusBadge';
import styles from './MemberDrawer.module.css';

type MemberDrawerProps = {
  isOpen: boolean;
  member: MemberWithUser | null;
  onClose: () => void;
  viewerRole?: MemberRole | null;
};

type MemberActionsMenuProps = {
  viewerRole?: MemberRole | null;
  targetRole?: MemberRole | null;
  targetStatus?: MemberStatus | null;
  isSelf?: boolean;
  isLoading?: boolean;
};

function getDisplayName(member: MemberWithUser) {
  const first = member.user.first_name?.trim();
  const last = member.user.last_name?.trim();
  const fullName = [first, last].filter(Boolean).join(' ');
  if (fullName) return fullName;
  if (member.user.email) return member.user.email;
  return 'Unnamed member';
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

function normalizeStatus(status?: string | null) {
  return status?.trim().toLowerCase() ?? '';
}

function MemberActionsMenu({
  viewerRole,
  targetRole,
  targetStatus,
  isSelf = false,
  isLoading = false,
}: MemberActionsMenuProps) {
  const canManage = viewerRole === 'admin' || viewerRole === 'super_admin';
  if (!canManage) return null;

  const status = normalizeStatus(targetStatus);
  const isActive = status === 'active';
  const isSuspended = status === 'disabled' || status === 'suspended';
  const isTargetSuperAdmin = targetRole === 'super_admin';
  const baseDisabled = isLoading;

  const items = [
    {
      id: 'suspend',
      label: 'Suspend member',
      show: isActive,
      disabled: baseDisabled || isSelf || isTargetSuperAdmin,
    },
    {
      id: 'unsuspend',
      label: 'Unsuspend member',
      show: isSuspended,
      disabled: baseDisabled || isSelf || isTargetSuperAdmin,
    },
    {
      id: 'remove',
      label: 'Remove member',
      show: true,
      disabled: baseDisabled || isSelf || isTargetSuperAdmin,
    },
    {
      id: 'force-reauth',
      label: 'Force re-authentication',
      show: isActive,
      disabled: baseDisabled || isSelf,
    },
  ];

  const visibleItems = items.filter((item) => item.show);

  return (
    <MenuTrigger>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={styles.kebabButton}
        aria-label="Member actions"
      >
        ...
      </Button>
      <Popover className={styles.menuPopover} placement="bottom end">
        <Menu className={styles.menu} aria-label="Member actions">
          {visibleItems.length === 0 ? (
            <MenuItem id="no-actions" className={styles.menuItem} isDisabled>
              No actions available
            </MenuItem>
          ) : (
            visibleItems.map((item) => (
              <MenuItem
                key={item.id}
                id={item.id}
                className={styles.menuItem}
                isDisabled={item.disabled}
              >
                {item.label}
              </MenuItem>
            ))
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className={styles.placeholder}>
      <h3 className={styles.placeholderTitle}>{title}</h3>
      <p className={styles.placeholderText}>{description}</p>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className={styles.loading}>
      <div className={styles.skeletonBar} style={{ width: '60%' }} />
      <div className={styles.skeletonBar} style={{ width: '80%' }} />
      <div className={styles.skeletonBar} style={{ width: '45%' }} />
      <div className={styles.skeletonBar} style={{ width: '70%' }} />
    </div>
  );
}

export function MemberDrawer({ isOpen, member, onClose, viewerRole }: MemberDrawerProps) {
  const lastMemberRef = useRef<MemberWithUser | null>(null);
  const requestIdRef = useRef(0);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberId = member?.membership.user_id ?? null;

  if (member) {
    lastMemberRef.current = member;
  }

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadMember = useCallback(async (id: string) => {
    const requestId = (requestIdRef.current += 1);
    setLoading(true);
    setError(null);
    setDetail(null);

    try {
      const data = await getMemberDetail(id);
      if (requestIdRef.current !== requestId) return;
      setDetail(data);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      const normalized = err as HttpError | Error | null;
      const httpError = normalized as HttpError;
      const detailsMessage = (httpError.details as { message?: string } | undefined)?.message;
      setError(detailsMessage ?? httpError.message ?? 'Unable to load member.');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !memberId) return;
    loadMember(memberId);
  }, [isOpen, memberId, loadMember]);

  const overlayState = isOpen ? 'open' : 'closed';
  const displayMember = detail ?? member ?? lastMemberRef.current;

  const headerSubtitle = loading ? 'Refreshing member details...' : 'Member details';

  const targetRole = displayMember?.membership.role ?? null;
  const targetStatus = displayMember?.membership.status ?? null;
  const isSelf = detail?.is_self ?? false;
  const avatarUrl = displayMember?.user.image_url ?? null;
  const showLoading = loading || (!detail && !error);

  const tabContent = useMemo(() => {
    if (showLoading) return <LoadingPanel />;
    if (error) {
      return (
        <div className={styles.error} role="alert">
          {error}
        </div>
      );
    }
    return null;
  }, [error, showLoading]);

  if (!displayMember) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={isOpen ? onClose : undefined}
      data-state={overlayState}
      aria-hidden={!isOpen}
    >
      <section
        className={styles.drawer}
        data-state={overlayState}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialog}>
          <header className={styles.header}>
            <div className={styles.identity}>
              <div className={styles.avatar} aria-hidden="true">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className={styles.avatarImage} />
                ) : (
                  getInitials(displayMember)
                )}
              </div>
              <div>
                <h2 id="member-drawer-title" className={styles.title}>
                  {getDisplayName(displayMember)}
                </h2>
                <p className={styles.subtitle}>{headerSubtitle}</p>
                <div className={styles.metaRow}>
                  <MemberRoleBadge role={displayMember.membership.role} />
                  <MemberStatusBadge status={displayMember.membership.status} />
                </div>
              </div>
            </div>
            <div className={styles.headerActions}>
              <MemberActionsMenu
                viewerRole={viewerRole}
                targetRole={targetRole}
                targetStatus={targetStatus}
                isSelf={isSelf}
                isLoading={loading}
              />
              <Button type="button" variant="outline" size="sm" onPress={onClose}>
                Close
              </Button>
            </div>
          </header>
          <Tabs
            key={memberId ?? 'member-drawer'}
            className={styles.tabs}
            defaultSelectedKey="profile"
          >
            <TabList aria-label="Member detail tabs" className={styles.tabList}>
              <Tab id="profile" className={styles.tab}>
                Profile
              </Tab>
              <Tab id="activity" className={styles.tab}>
                Activity
              </Tab>
              <Tab id="notifications" className={styles.tab}>
                Notifications
              </Tab>
            </TabList>
            <TabPanel id="profile" className={styles.tabPanel}>
              {tabContent ?? (
                <PlaceholderPanel
                  title="Profile"
                  description="Profile details will appear here in FE-MEMBERS-004."
                />
              )}
            </TabPanel>
            <TabPanel id="activity" className={styles.tabPanel}>
              {tabContent ?? (
                <PlaceholderPanel
                  title="Activity"
                  description="Audit activity will appear here in FE-MEMBERS-006."
                />
              )}
            </TabPanel>
            <TabPanel id="notifications" className={styles.tabPanel}>
              {tabContent ?? (
                <PlaceholderPanel
                  title="Notifications"
                  description="Notification history will appear here in FE-MEMBERS-008."
                />
              )}
            </TabPanel>
          </Tabs>
        </div>
      </section>
    </div>
  );
}
