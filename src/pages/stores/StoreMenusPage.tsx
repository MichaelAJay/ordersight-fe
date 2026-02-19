import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog/ConfirmDialog';
import { HttpError } from '../../services/http';
import {
  assignStoreMenu,
  getMenuById,
  listMenus,
  listStoreMenus,
  removeStoreMenu,
  type MenuDetail,
  type MenuSummary,
  type StoreMenuSummary,
} from '../../services/menus';
import { StoreTabContent } from './StoreTabContent';
import styles from './StoreMenusPage.module.css';

type ActionMessage = {
  tone: 'success' | 'error' | 'info';
  text: string;
} | null;

function normalizeRole(role: string | null | undefined) {
  if (!role) return null;
  return role.replace(/^org:/, '');
}

function isAdminRole(role: string | null | undefined) {
  if (!role) return false;
  return role === 'admin' || role === 'super_admin';
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function formatDate(dateLike: string | undefined): string {
  if (!dateLike) {
    return '—';
  }
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function getDetailItemID(detailItem: MenuDetail['items'][number], index: number): string {
  const menuItem = detailItem.menu_item;
  if (!menuItem || typeof menuItem !== 'object') {
    return `menu-item-${index}`;
  }
  const idValue = (menuItem as Record<string, unknown>)['id'];
  if (typeof idValue !== 'string' || idValue.trim().length === 0) {
    return `menu-item-${index}`;
  }
  return idValue;
}

function getDetailItemName(detailItem: MenuDetail['items'][number]): string {
  const menuItem = detailItem.menu_item;
  if (!menuItem || typeof menuItem !== 'object') {
    return 'Unnamed item';
  }
  const nameValue = (menuItem as Record<string, unknown>)['name'];
  if (typeof nameValue !== 'string') {
    return 'Unnamed item';
  }
  const normalized = nameValue.trim();
  return normalized.length > 0 ? normalized : 'Unnamed item';
}

type StoreMenusPageContentProps = {
  isAdmin: boolean;
  navigate: ReturnType<typeof useNavigate>;
  storeId: string | undefined;
};

export function StoreMenusPage() {
  const { storeId } = useParams();
  const { orgRole } = useAuth();
  const navigate = useNavigate();

  const normalizedRole = normalizeRole(orgRole ?? null);
  const isAdmin = isAdminRole(normalizedRole);

  return (
    <StoreMenusPageContent
      key={storeId ?? '__missing-store-id__'}
      isAdmin={isAdmin}
      navigate={navigate}
      storeId={storeId}
    />
  );
}

function StoreMenusPageContent({ isAdmin, navigate, storeId }: StoreMenusPageContentProps) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [storeMenusLoading, setStoreMenusLoading] = useState(Boolean(storeId));
  const [storeMenusError, setStoreMenusError] = useState<string | null>(
    storeId ? null : 'Missing store identifier.',
  );
  const [storeMenus, setStoreMenus] = useState<StoreMenuSummary[]>([]);

  const [selectedMenuID, setSelectedMenuID] = useState<string | null>(null);
  const [menuDetailLoading, setMenuDetailLoading] = useState(false);
  const [menuDetailError, setMenuDetailError] = useState<string | null>(null);
  const [menuDetail, setMenuDetail] = useState<MenuDetail | null>(null);

  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);

  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [orgMenusLoading, setOrgMenusLoading] = useState(false);
  const [orgMenusLoaded, setOrgMenusLoaded] = useState(false);
  const [orgMenusError, setOrgMenusError] = useState<string | null>(null);
  const [orgMenus, setOrgMenus] = useState<MenuSummary[]>([]);
  const [selectedOrgMenuID, setSelectedOrgMenuID] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<StoreMenuSummary | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const loadOrgMenus = () => {
    if (orgMenusLoading) {
      return;
    }

    setOrgMenusLoading(true);
    setOrgMenusError(null);

    listMenus()
      .then((menus) => {
        setOrgMenus(menus);
        setOrgMenusLoaded(true);
      })
      .catch((error) => {
        setOrgMenusError(getErrorMessage(error, 'Unable to load organization menus.'));
      })
      .finally(() => {
        setOrgMenusLoading(false);
      });
  };

  const unassignedOrgMenus = useMemo(() => {
    const assignedIDs = new Set(storeMenus.map((menu) => menu.id));
    return orgMenus.filter((menu) => !assignedIDs.has(menu.id));
  }, [orgMenus, storeMenus]);

  const effectiveSelectedOrgMenuID = useMemo(() => {
    if (selectedOrgMenuID && unassignedOrgMenus.some((menu) => menu.id === selectedOrgMenuID)) {
      return selectedOrgMenuID;
    }
    return unassignedOrgMenus[0]?.id ?? '';
  }, [selectedOrgMenuID, unassignedOrgMenus]);

  const selectedStoreMenuID = useMemo(() => {
    if (!selectedMenuID) {
      return null;
    }
    return storeMenus.some((menu) => menu.id === selectedMenuID) ? selectedMenuID : null;
  }, [selectedMenuID, storeMenus]);

  const refreshStoreMenus = () => {
    if (!storeId) {
      setStoreMenusError('Missing store identifier.');
      return;
    }
    setStoreMenusLoading(true);
    setStoreMenusError(null);
    setRefreshToken((previous) => previous + 1);
  };

  const handleSelectMenu = (menuID: string) => {
    if (selectedMenuID === menuID) {
      return;
    }
    setSelectedMenuID(menuID);
    setMenuDetailLoading(true);
    setMenuDetailError(null);
    setMenuDetail(null);
  };

  useEffect(() => {
    if (!storeId) {
      return;
    }

    let active = true;

    listStoreMenus(storeId)
      .then((menus) => {
        if (!active) return;
        setStoreMenus(menus);
      })
      .catch((error) => {
        if (!active) return;
        setStoreMenusError(getErrorMessage(error, 'Unable to load store menus.'));
      })
      .finally(() => {
        if (!active) return;
        setStoreMenusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [storeId, refreshToken]);

  useEffect(() => {
    if (!selectedStoreMenuID) {
      return;
    }

    let active = true;

    getMenuById(selectedStoreMenuID)
      .then((detail) => {
        if (!active) return;
        if (!detail) {
          setMenuDetail(null);
          setMenuDetailError('Menu details were not returned.');
          return;
        }
        setMenuDetail(detail);
      })
      .catch((error) => {
        if (!active) return;
        setMenuDetail(null);
        setMenuDetailError(getErrorMessage(error, 'Unable to load menu details.'));
      })
      .finally(() => {
        if (!active) return;
        setMenuDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedStoreMenuID]);

  useEffect(() => {
    if (!actionMessage) return;
    const timeoutID = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(timeoutID);
  }, [actionMessage]);

  const handleRetry = () => {
    refreshStoreMenus();
  };

  const handleToggleAddPanel = () => {
    const nextOpen = !addPanelOpen;
    setAddPanelOpen(nextOpen);
    setAddError(null);
    if (nextOpen && !orgMenusLoaded && !orgMenusLoading) {
      loadOrgMenus();
    }
  };

  const handleAssignMenu = () => {
    if (!storeId) {
      setAddError('Missing store identifier.');
      return;
    }
    if (!effectiveSelectedOrgMenuID) {
      setAddError('Select a menu to attach.');
      return;
    }

    const menuID = effectiveSelectedOrgMenuID;
    setAddBusy(true);
    setAddError(null);

    assignStoreMenu(storeId, menuID)
      .then(() => {
        setActionMessage({ tone: 'success', text: 'Menu attached to this store.' });
        handleSelectMenu(menuID);
        setAddPanelOpen(false);
        refreshStoreMenus();
      })
      .catch((error) => {
        setAddError(getErrorMessage(error, 'Unable to attach menu to this store.'));
      })
      .finally(() => {
        setAddBusy(false);
      });
  };

  const handleCancelRemove = () => {
    if (removeBusy) {
      return;
    }
    setRemoveTarget(null);
    setRemoveError(null);
  };

  const handleConfirmRemove = () => {
    if (!storeId || !removeTarget) {
      setRemoveError('Unable to remove menu.');
      return;
    }

    setRemoveBusy(true);
    setRemoveError(null);

    removeStoreMenu(storeId, removeTarget.id)
      .then(() => {
        setActionMessage({ tone: 'success', text: 'Menu removed from this store.' });
        setRemoveTarget(null);
        refreshStoreMenus();
      })
      .catch((error) => {
        setRemoveError(getErrorMessage(error, 'Unable to remove this menu.'));
      })
      .finally(() => {
        setRemoveBusy(false);
      });
  };

  const hasNoStoreMenus = !storeMenusLoading && !storeMenusError && storeMenus.length === 0;

  return (
    <div className={styles.page}>
      <StoreTabContent
        title="Menus"
        description="Attach organization menus to this store, then inspect full menu details."
        actions={
          isAdmin ? (
            <Button
              variant={addPanelOpen ? 'outline' : 'primary'}
              size="sm"
              onPress={handleToggleAddPanel}
            >
              {addPanelOpen ? 'Close Add Menu' : 'Add Menu'}
            </Button>
          ) : undefined
        }
      />

      {actionMessage ? (
        <div className={styles.actionMessage} data-tone={actionMessage.tone} role="status">
          {actionMessage.text}
        </div>
      ) : null}

      {isAdmin && addPanelOpen ? (
        <section className={styles.addPanel} aria-label="Attach menu to store">
          <div className={styles.addHeader}>
            <h3 className={styles.addTitle}>Attach menu</h3>
            <p className={styles.addHint}>Choose one organization menu to attach to this store.</p>
          </div>

          {orgMenusLoading ? (
            <p className={styles.panelMuted}>Loading organization menus...</p>
          ) : null}

          {!orgMenusLoading && orgMenusError ? (
            <div className={styles.statePanel} role="alert">
              <h4 className={styles.stateTitle}>Unable to load menus</h4>
              <p className={styles.stateText}>{orgMenusError}</p>
              <Button variant="outline" size="sm" onPress={loadOrgMenus}>
                Retry
              </Button>
            </div>
          ) : null}

          {!orgMenusLoading && !orgMenusError && orgMenus.length === 0 ? (
            <div className={styles.statePanel}>
              <h4 className={styles.stateTitle}>No organization menus yet</h4>
              <p className={styles.stateText}>
                Import your first menu! Once imported, you can attach it to this store.
              </p>
              <div className={styles.inlineActions}>
                <Button size="sm" onPress={() => navigate('/menus/import')}>
                  Import your first menu!
                </Button>
                <Button variant="outline" size="sm" onPress={() => navigate('/menus')}>
                  Go to Menus
                </Button>
              </div>
            </div>
          ) : null}

          {!orgMenusLoading &&
          !orgMenusError &&
          orgMenus.length > 0 &&
          unassignedOrgMenus.length === 0 ? (
            <p className={styles.panelMuted}>
              All organization menus are already attached to this store.
            </p>
          ) : null}

          {!orgMenusLoading && !orgMenusError && unassignedOrgMenus.length > 0 ? (
            <div className={styles.addControls}>
              <label className={styles.inputLabel}>
                Menu
                <select
                  className={styles.inputControl}
                  value={effectiveSelectedOrgMenuID}
                  onChange={(event) => setSelectedOrgMenuID(event.target.value)}
                  disabled={addBusy}
                >
                  {unassignedOrgMenus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.inlineActions}>
                <Button
                  size="sm"
                  onPress={handleAssignMenu}
                  isDisabled={addBusy || !effectiveSelectedOrgMenuID}
                >
                  {addBusy ? 'Attaching...' : 'Attach Menu'}
                </Button>
              </div>
              {addError ? (
                <p role="alert" className={styles.panelError}>
                  {addError}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {storeMenusError ? (
        <div className={styles.statePanel} role="alert">
          <h3 className={styles.stateTitle}>Unable to load store menus</h3>
          <p className={styles.stateText}>{storeMenusError}</p>
          <Button variant="outline" size="sm" onPress={handleRetry}>
            Retry
          </Button>
        </div>
      ) : null}

      {storeMenusLoading ? <p className={styles.panelMuted}>Loading store menus...</p> : null}

      {hasNoStoreMenus ? (
        <div className={styles.statePanel}>
          <h3 className={styles.stateTitle}>No menus attached yet</h3>
          <p className={styles.stateText}>
            {isAdmin
              ? 'Attach a menu so this store can start taking orders from it.'
              : 'An admin can attach menus to this store.'}
          </p>
        </div>
      ) : null}

      {!storeMenusLoading && !storeMenusError && storeMenus.length > 0 ? (
        <section className={styles.cardsGrid} aria-label="Store menu cards">
          {storeMenus.map((menu) => {
            const active = menu.is_active !== false;
            const selected = menu.id === selectedStoreMenuID;

            return (
              <article key={menu.id} className={styles.card} data-selected={selected}>
                <button
                  type="button"
                  className={styles.cardButton}
                  onClick={() => handleSelectMenu(menu.id)}
                  aria-pressed={selected}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{menu.name}</h3>
                    <span className={styles.statusBadge} data-active={active}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {menu.description ? (
                    <p className={styles.cardDescription}>{menu.description}</p>
                  ) : (
                    <p className={styles.cardDescriptionMuted}>No description</p>
                  )}
                  <p className={styles.cardMeta}>Assigned {formatDate(menu.assigned_at)}</p>
                </button>
                {isAdmin ? (
                  <div className={styles.cardMenu}>
                    <MenuTrigger>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={styles.kebabButton}
                        aria-label={`Actions for ${menu.name}`}
                      >
                        ⋮
                      </Button>
                      <Popover className={styles.menuPopover} placement="bottom end">
                        <Menu
                          className={styles.menu}
                          aria-label={`Actions for ${menu.name}`}
                          onAction={(key) => {
                            if (String(key) === 'remove') {
                              setRemoveTarget(menu);
                              setRemoveError(null);
                            }
                          }}
                        >
                          <MenuItem id="remove" className={styles.menuItem}>
                            Remove Menu
                          </MenuItem>
                        </Menu>
                      </Popover>
                    </MenuTrigger>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      <section className={styles.detailPanel} aria-label="Selected menu details">
        <h3 className={styles.detailTitle}>Menu details</h3>
        {!selectedStoreMenuID ? (
          <p className={styles.detailHint}>Select a menu card to load the full menu.</p>
        ) : null}
        {selectedStoreMenuID && menuDetailLoading ? (
          <p className={styles.detailHint}>Loading full menu...</p>
        ) : null}
        {selectedStoreMenuID && menuDetailError ? (
          <p className={styles.panelError} role="alert">
            {menuDetailError}
          </p>
        ) : null}
        {selectedStoreMenuID && !menuDetailLoading && !menuDetailError && menuDetail ? (
          <div>
            <div className={styles.detailHeader}>
              <h4 className={styles.detailMenuName}>{menuDetail.name}</h4>
              <span className={styles.statusBadge} data-active={menuDetail.is_active !== false}>
                {menuDetail.is_active === false ? 'Inactive' : 'Active'}
              </span>
            </div>
            <p className={styles.cardDescription}>
              {menuDetail.description?.trim().length
                ? menuDetail.description
                : 'No description for this menu.'}
            </p>
            <p className={styles.cardMeta}>
              {menuDetail.items.length} item{menuDetail.items.length === 1 ? '' : 's'}
            </p>
            {menuDetail.items.length === 0 ? (
              <p className={styles.detailHint}>This menu does not have any items yet.</p>
            ) : (
              <ul className={styles.itemList}>
                {menuDetail.items.map((item, index) => (
                  <li key={`${getDetailItemID(item, index)}-${index}`} className={styles.itemRow}>
                    <span className={styles.itemName}>{getDetailItemName(item)}</span>
                    <span className={styles.itemOrder}>#{item.sort_order + 1}</span>
                    <span className={styles.itemStatus} data-active={item.is_active !== false}>
                      {item.is_active === false ? 'Inactive' : 'Active'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        title={removeTarget ? `Remove "${removeTarget.name}" from this store?` : 'Remove menu?'}
        description="The menu remains in your organization, but it will be detached from this store."
        confirmLabel="Remove menu"
        onConfirm={handleConfirmRemove}
        onCancel={handleCancelRemove}
        loading={removeBusy}
        error={removeError}
      />
    </div>
  );
}
