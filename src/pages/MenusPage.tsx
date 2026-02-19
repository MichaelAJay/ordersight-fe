import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog/ConfirmDialog';
import { HttpError } from '@/services/http';
import {
  getMenuItemById,
  listCategories,
  listMenuItems,
  type MenuItem,
  type MenuItemDetail,
  type PriceUnit,
} from '@/services/menuItems';
import {
  assignMenuStoresBulk,
  assignMenuItems,
  createMenu,
  deleteMenu,
  getMenuById,
  listMenuStores,
  listMenus,
  removeStoreMenu,
  removeMenuItemAssignment,
  type MenuDetail,
  type MenuSummary,
} from '@/services/menus';
import { listStores, type Store } from '@/services/stores';
import styles from './MenusPage.module.css';

const CATALOG_LIMIT = 200;
type MenusTab = 'menus' | 'items';
type DeleteMenuTarget = {
  id: string;
  name: string;
  itemCount?: number;
};
type AssignMenuTarget = {
  id: string;
  name: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function formatPrice(cents: number | null, unit: PriceUnit | null): string {
  if (typeof cents !== 'number') {
    return 'Set later';
  }

  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

  if (unit === 'per_person') {
    return `${amount} / person`;
  }
  if (unit === 'per_unit') {
    return `${amount} / unit`;
  }
  return amount;
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

function getCategoryMap(items: MenuItem[], categories: { id: string; name: string }[]) {
  const categoryMap = new Map<string, string>();
  for (const category of categories) {
    categoryMap.set(category.id, category.name);
  }

  const byItem = new Map<string, string>();
  for (const item of items) {
    if (!item.category_id) {
      continue;
    }
    const categoryName = categoryMap.get(item.category_id);
    if (categoryName) {
      byItem.set(item.id, categoryName);
    }
  }

  return byItem;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const raw = record[key];
  return typeof raw === 'string' ? raw : '';
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const raw = record[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function readBool(record: Record<string, unknown>, key: string, fallback = false): boolean {
  const raw = record[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

export function MenusPage() {
  const navigate = useNavigate();
  const { isLoaded } = useAuth();
  const [activeTab, setActiveTab] = useState<MenusTab>('menus');
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [hasSettledFetch, setHasSettledFetch] = useState(false);
  const [menus, setMenus] = useState<MenuSummary[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [menuName, setMenuName] = useState('');
  const [menuDescription, setMenuDescription] = useState('');
  const [selectedItemIDs, setSelectedItemIDs] = useState<string[]>([]);
  const [creatingMenu, setCreatingMenu] = useState(false);
  const [cloningMenuID, setCloningMenuID] = useState<string | null>(null);
  const [deleteMenuTarget, setDeleteMenuTarget] = useState<DeleteMenuTarget | null>(null);
  const [deleteMenuBusy, setDeleteMenuBusy] = useState(false);
  const [deleteMenuError, setDeleteMenuError] = useState<string | null>(null);
  const [assignMenuTarget, setAssignMenuTarget] = useState<AssignMenuTarget | null>(null);
  const [assignStoresLoading, setAssignStoresLoading] = useState(false);
  const [assignStoresError, setAssignStoresError] = useState<string | null>(null);
  const [assignAllStores, setAssignAllStores] = useState<Store[]>([]);
  const [assignInitialStoreIDs, setAssignInitialStoreIDs] = useState<string[]>([]);
  const [assignSelectedStoreIDs, setAssignSelectedStoreIDs] = useState<string[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [createMenuError, setCreateMenuError] = useState<string | null>(null);
  const [createMenuSuccess, setCreateMenuSuccess] = useState<string | null>(null);
  const [menuDetailsID, setMenuDetailsID] = useState<string | null>(null);
  const [menuDetailsRefreshSeed, setMenuDetailsRefreshSeed] = useState(0);
  const [menuDetailsLoading, setMenuDetailsLoading] = useState(false);
  const [menuDetailsError, setMenuDetailsError] = useState<string | null>(null);
  const [menuDetails, setMenuDetails] = useState<MenuDetail | null>(null);
  const [menuDetailsAddItemID, setMenuDetailsAddItemID] = useState('');
  const [menuEditBusy, setMenuEditBusy] = useState(false);
  const [menuEditError, setMenuEditError] = useState<string | null>(null);
  const [menuEditSuccess, setMenuEditSuccess] = useState<string | null>(null);
  const [itemDetailsID, setItemDetailsID] = useState<string | null>(null);
  const [itemDetailsLoading, setItemDetailsLoading] = useState(false);
  const [itemDetailsError, setItemDetailsError] = useState<string | null>(null);
  const [itemDetails, setItemDetails] = useState<MenuItemDetail | null>(null);
  const itemDetailsPanelRef = useRef<HTMLDivElement | null>(null);

  const loading = isLoaded && !hasSettledFetch;
  const hasMenus = menus.length > 0;
  const hasItems = totalItems > 0;
  const selectedItemSet = useMemo(() => new Set(selectedItemIDs), [selectedItemIDs]);
  const selectedCount = selectedItemIDs.length;
  const assignedMenuItemIDSet = useMemo(() => {
    const assigned = new Set<string>();
    if (!menuDetails) {
      return assigned;
    }
    for (const entry of menuDetails.items) {
      const menuItem = asRecord(entry.menu_item);
      const itemID = readString(menuItem, 'id');
      if (itemID) {
        assigned.add(itemID);
      }
    }
    return assigned;
  }, [menuDetails]);
  const addableItemsForMenu = useMemo(
    () => items.filter((item) => item.is_active && !assignedMenuItemIDSet.has(item.id)),
    [assignedMenuItemIDSet, items],
  );
  const assignSelectedStoreSet = useMemo(
    () => new Set(assignSelectedStoreIDs),
    [assignSelectedStoreIDs],
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    let active = true;

    Promise.allSettled([
      listMenus(),
      listMenuItems({ limit: CATALOG_LIMIT, offset: 0 }),
      listCategories(),
    ])
      .then((results) => {
        if (!active) return;

        const menusResult = results[0];
        const catalogResult = results[1];
        if (menusResult.status !== 'fulfilled') {
          throw menusResult.reason;
        }
        if (catalogResult.status !== 'fulfilled') {
          throw catalogResult.reason;
        }

        const categories = results[2].status === 'fulfilled' ? results[2].value : [];

        setMenus(menusResult.value);
        setItems(catalogResult.value.items);
        setTotalItems(catalogResult.value.total);
        setCategoryMap(getCategoryMap(catalogResult.value.items, categories));
        setSelectedItemIDs((previous) =>
          previous.filter((id) => catalogResult.value.items.some((item) => item.id === id)),
        );
        setError(null);
      })
      .catch((fetchError) => {
        if (!active) return;
        const httpError = fetchError as HttpError | null;
        if (httpError?.status === 401) {
          setError('Reconnect your session to load menus and items.');
          return;
        }
        if (httpError?.status === 403) {
          setError('You do not have permission to view menus.');
          return;
        }
        setError(getErrorMessage(fetchError, 'Unable to load menus and items.'));
      })
      .finally(() => {
        if (active) {
          setHasSettledFetch(true);
        }
      });

    return () => {
      active = false;
    };
  }, [isLoaded, refreshSeed]);

  useEffect(() => {
    if (!menuDetailsID) {
      setMenuDetails(null);
      setMenuDetailsError(null);
      setMenuDetailsLoading(false);
      setMenuDetailsAddItemID('');
      setMenuEditError(null);
      setMenuEditSuccess(null);
      return;
    }

    let active = true;
    setMenuDetailsLoading(true);
    setMenuDetailsError(null);

    getMenuById(menuDetailsID)
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result) {
          setMenuDetailsError('Menu details were not returned.');
          setMenuDetails(null);
          return;
        }
        setMenuDetails(result);
      })
      .catch((detailsError) => {
        if (!active) {
          return;
        }
        setMenuDetailsError(getErrorMessage(detailsError, 'Unable to load menu details.'));
        setMenuDetails(null);
      })
      .finally(() => {
        if (active) {
          setMenuDetailsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [menuDetailsID, menuDetailsRefreshSeed]);

  useEffect(() => {
    if (!itemDetailsID) {
      setItemDetails(null);
      setItemDetailsError(null);
      setItemDetailsLoading(false);
      return;
    }

    let active = true;
    setItemDetailsLoading(true);
    setItemDetailsError(null);

    getMenuItemById(itemDetailsID)
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result) {
          setItemDetailsError('Menu item details were not returned.');
          setItemDetails(null);
          return;
        }
        setItemDetails(result);
      })
      .catch((detailsError) => {
        if (!active) {
          return;
        }
        setItemDetailsError(getErrorMessage(detailsError, 'Unable to load menu item details.'));
        setItemDetails(null);
      })
      .finally(() => {
        if (active) {
          setItemDetailsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [itemDetailsID]);

  useEffect(() => {
    if (!menuDetailsAddItemID) {
      return;
    }
    const stillAvailable = addableItemsForMenu.some((item) => item.id === menuDetailsAddItemID);
    if (!stillAvailable) {
      setMenuDetailsAddItemID('');
    }
  }, [addableItemsForMenu, menuDetailsAddItemID]);

  useEffect(() => {
    if (!itemDetailsID) {
      return;
    }
    const panel = itemDetailsPanelRef.current;
    if (!panel) {
      return;
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel.focus({ preventScroll: true });
  }, [itemDetailsID]);

  const subtitle = useMemo(() => {
    if (activeTab === 'menus') {
      if (hasMenus) {
        return 'Menus are reusable groupings of menu items. Create, clone, and iterate safely.';
      }
      return 'No menus yet. Build one from your item library or import menu items first.';
    }
    if (hasItems) {
      return 'This is your item library. Select items to compose a new menu.';
    }
    return 'Import menu items first, then compose menus from this library.';
  }, [activeTab, hasItems, hasMenus]);

  const handleRetry = () => {
    setHasSettledFetch(false);
    setRefreshSeed((seed) => seed + 1);
  };

  const refreshMenusAndLibrary = () => {
    setHasSettledFetch(false);
    setRefreshSeed((seed) => seed + 1);
  };

  const toggleItemSelected = (itemID: string, isSelected: boolean) => {
    setSelectedItemIDs((previous) => {
      const current = new Set(previous);
      if (isSelected) {
        current.add(itemID);
      } else {
        current.delete(itemID);
      }
      return Array.from(current);
    });
  };

  const selectAllItems = () => {
    setSelectedItemIDs(items.map((item) => item.id));
  };

  const clearSelectedItems = () => {
    setSelectedItemIDs([]);
  };

  const handleOpenItemDetails = (itemID: string) => {
    if (itemDetailsID === itemID) {
      const panel = itemDetailsPanelRef.current;
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel.focus({ preventScroll: true });
      }
      return;
    }
    setItemDetailsID(itemID);
  };

  const handleCreateMenuFromSelected = async () => {
    const name = menuName.trim();
    if (!name) {
      setCreateMenuError('Menu name is required.');
      return;
    }
    if (selectedItemIDs.length === 0) {
      setCreateMenuError('Select at least one menu item to create a menu.');
      return;
    }

    setCreatingMenu(true);
    setCreateMenuError(null);
    setCreateMenuSuccess(null);

    let createdMenuID = '';
    try {
      const created = await createMenu({
        name,
        description: menuDescription.trim() || null,
      });
      if (!created?.id) {
        throw new Error('Menu was created but no menu id was returned.');
      }
      createdMenuID = created.id;
      await assignMenuItems(createdMenuID, selectedItemIDs);

      setCreateMenuSuccess(
        `Created menu "${created.name}" with ${selectedItemIDs.length} selected item${
          selectedItemIDs.length === 1 ? '' : 's'
        }.`,
      );
      setMenuName('');
      setMenuDescription('');
      setSelectedItemIDs([]);
      setActiveTab('menus');
      refreshMenusAndLibrary();
    } catch (createError) {
      if (createdMenuID) {
        setCreateMenuError(
          'Menu was created, but assigning selected items failed. Open the menu and add items manually.',
        );
      } else {
        setCreateMenuError(getErrorMessage(createError, 'Unable to create menu.'));
      }
    } finally {
      setCreatingMenu(false);
    }
  };

  const handleCloneMenu = async (menuID: string) => {
    setCreateMenuError(null);
    setCreateMenuSuccess(null);
    setCloningMenuID(menuID);

    let createdMenuID = '';
    try {
      const source = await getMenuById(menuID);
      if (!source) {
        throw new Error('Unable to load source menu.');
      }

      const cloned = await createMenu({
        name: `${source.name} (Copy)`,
        description: source.description ?? null,
      });
      if (!cloned?.id) {
        throw new Error('Clone menu id was not returned.');
      }
      createdMenuID = cloned.id;

      const itemIDs = source.items
        .map((entry) => {
          const menuItem = asRecord(entry.menu_item);
          return readString(menuItem, 'id');
        })
        .filter((id) => id.length > 0);

      if (itemIDs.length > 0) {
        await assignMenuItems(createdMenuID, itemIDs);
      }

      setCreateMenuSuccess(
        `Cloned "${source.name}" as "${cloned.name}" with ${itemIDs.length} item${
          itemIDs.length === 1 ? '' : 's'
        }.`,
      );
      refreshMenusAndLibrary();
    } catch (cloneError) {
      if (createdMenuID) {
        setCreateMenuError(
          'Clone menu was created, but item assignment failed. Add items manually in the new menu.',
        );
      } else {
        setCreateMenuError(getErrorMessage(cloneError, 'Unable to clone menu.'));
      }
    } finally {
      setCloningMenuID(null);
    }
  };

  const handleRequestDeleteMenu = (menuID: string, menuName: string, itemCount?: number) => {
    setDeleteMenuError(null);
    setDeleteMenuTarget({ id: menuID, name: menuName, itemCount });
  };

  const handleCancelDeleteMenu = () => {
    if (deleteMenuBusy) {
      return;
    }
    setDeleteMenuError(null);
    setDeleteMenuTarget(null);
  };

  const handleOpenAssignMenu = async (menu: MenuSummary) => {
    setAssignMenuTarget({ id: menu.id, name: menu.name });
    setAssignStoresLoading(true);
    setAssignStoresError(null);
    setAssignError(null);
    setAssignAllStores([]);
    setAssignInitialStoreIDs([]);
    setAssignSelectedStoreIDs([]);
    setCreateMenuError(null);
    setCreateMenuSuccess(null);

    try {
      const [allStores, assignedStores] = await Promise.all([
        listStores(),
        listMenuStores(menu.id),
      ]);
      const sortedStores = [...allStores].sort((a, b) => a.name.localeCompare(b.name));
      const availableStoreIDs = new Set(sortedStores.map((store) => store.id));
      const assignedStoreIDs = assignedStores
        .map((store) => store.store_id)
        .filter((storeID) => availableStoreIDs.has(storeID));

      setAssignAllStores(sortedStores);
      setAssignInitialStoreIDs(assignedStoreIDs);
      setAssignSelectedStoreIDs(assignedStoreIDs);
    } catch (assignLoadError) {
      setAssignStoresError(
        getErrorMessage(assignLoadError, 'Unable to load store assignments for this menu.'),
      );
    } finally {
      setAssignStoresLoading(false);
    }
  };

  const toggleAssignStoreSelected = (storeID: string, checked: boolean) => {
    setAssignSelectedStoreIDs((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(storeID);
      } else {
        next.delete(storeID);
      }
      return Array.from(next);
    });
  };

  const handleCancelAssignMenu = () => {
    if (assignBusy) {
      return;
    }
    setAssignMenuTarget(null);
    setAssignStoresLoading(false);
    setAssignStoresError(null);
    setAssignError(null);
    setAssignAllStores([]);
    setAssignInitialStoreIDs([]);
    setAssignSelectedStoreIDs([]);
  };

  const handleConfirmAssignMenu = async () => {
    if (!assignMenuTarget) {
      return;
    }
    if (assignStoresLoading) {
      setAssignError('Store list is still loading.');
      return;
    }
    if (assignStoresError) {
      setAssignError('Unable to save until store assignments are loaded.');
      return;
    }
    const target = assignMenuTarget;
    const selectedSet = new Set(assignSelectedStoreIDs);
    const initialSet = new Set(assignInitialStoreIDs);
    const toAssign = assignSelectedStoreIDs.filter((storeID) => !initialSet.has(storeID));
    const toRemove = assignInitialStoreIDs.filter((storeID) => !selectedSet.has(storeID));

    if (toAssign.length === 0 && toRemove.length === 0) {
      setAssignMenuTarget(null);
      return;
    }

    setAssignBusy(true);
    setAssignError(null);

    try {
      if (toAssign.length > 0) {
        await assignMenuStoresBulk(target.id, toAssign);
      }
      if (toRemove.length > 0) {
        await Promise.all(toRemove.map((storeID) => removeStoreMenu(storeID, target.id)));
      }
      setCreateMenuSuccess(`Updated store assignments for "${target.name}".`);
      setAssignMenuTarget(null);
      setAssignAllStores([]);
      setAssignInitialStoreIDs([]);
      setAssignSelectedStoreIDs([]);
    } catch (assignErrorValue) {
      setAssignError(getErrorMessage(assignErrorValue, 'Unable to update store assignments.'));
    } finally {
      setAssignBusy(false);
    }
  };

  const handleConfirmDeleteMenu = async () => {
    if (!deleteMenuTarget) {
      return;
    }
    setDeleteMenuBusy(true);
    setDeleteMenuError(null);
    setCreateMenuError(null);
    try {
      await deleteMenu(deleteMenuTarget.id);
      if (menuDetailsID === deleteMenuTarget.id) {
        setMenuDetailsID(null);
      }
      setCreateMenuSuccess(`Deleted menu "${deleteMenuTarget.name}".`);
      setDeleteMenuTarget(null);
      refreshMenusAndLibrary();
    } catch (deleteError) {
      setDeleteMenuError(getErrorMessage(deleteError, 'Unable to delete menu.'));
    } finally {
      setDeleteMenuBusy(false);
    }
  };

  const handleAddItemToFocusedMenu = async () => {
    if (!menuDetails?.id || !menuDetailsAddItemID) {
      return;
    }
    setMenuEditBusy(true);
    setMenuEditError(null);
    setMenuEditSuccess(null);
    try {
      await assignMenuItems(menuDetails.id, [menuDetailsAddItemID]);
      const added = addableItemsForMenu.find((item) => item.id === menuDetailsAddItemID);
      setMenuEditSuccess(`Added "${added?.name ?? 'menu item'}" to "${menuDetails.name}".`);
      setMenuDetailsAddItemID('');
      setMenuDetailsRefreshSeed((seed) => seed + 1);
      refreshMenusAndLibrary();
    } catch (editError) {
      setMenuEditError(getErrorMessage(editError, 'Unable to add menu item to this menu.'));
    } finally {
      setMenuEditBusy(false);
    }
  };

  const handleRemoveItemFromFocusedMenu = async (menuItemID: string, menuItemName: string) => {
    if (!menuDetails?.id || !menuItemID) {
      return;
    }
    setMenuEditBusy(true);
    setMenuEditError(null);
    setMenuEditSuccess(null);
    try {
      await removeMenuItemAssignment(menuDetails.id, menuItemID);
      setMenuEditSuccess(`Removed "${menuItemName}" from "${menuDetails.name}".`);
      setMenuDetailsRefreshSeed((seed) => seed + 1);
      refreshMenusAndLibrary();
    } catch (editError) {
      setMenuEditError(getErrorMessage(editError, 'Unable to remove menu item from this menu.'));
    } finally {
      setMenuEditBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Menus</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.toolbar}>
          <Button type="button" size="sm" onPress={() => navigate('/menus/import')}>
            Import menu items
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPress={() => navigate('/menus/quick-entry')}
          >
            Quick-add items
          </Button>
        </div>
      </header>

      {!isLoaded ? (
        <section className={styles.loadingState}>
          <p>Checking access...</p>
        </section>
      ) : null}

      {isLoaded && loading ? (
        <section className={styles.loadingState}>
          <p>Loading menus and item library...</p>
        </section>
      ) : null}

      {isLoaded && !loading && error ? (
        <section className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>Unable to load menus</h2>
          <p className={styles.errorText}>{error}</p>
          <div className={styles.errorActions}>
            <Button type="button" variant="outline" size="sm" onPress={handleRetry}>
              Retry
            </Button>
          </div>
        </section>
      ) : null}

      {isLoaded && !loading && !error ? (
        <>
          <section className={styles.tabBar}>
            <Button
              type="button"
              size="sm"
              variant={activeTab === 'menus' ? 'primary' : 'outline'}
              onPress={() => setActiveTab('menus')}
            >
              Menus ({menus.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === 'items' ? 'primary' : 'outline'}
              onPress={() => setActiveTab('items')}
            >
              Item Library ({totalItems})
            </Button>
          </section>

          {createMenuSuccess ? <p className={styles.success}>{createMenuSuccess}</p> : null}
          {createMenuError ? (
            <p className={styles.error} role="alert">
              {createMenuError}
            </p>
          ) : null}

          {activeTab === 'menus' ? (
            <>
              {!hasMenus ? (
                <section className={styles.emptyState}>
                  <h2 className={styles.emptyTitle}>No menus created yet</h2>
                  <p className={styles.emptyText}>
                    Create a menu from your available item library, or import additional menu items.
                  </p>

                  <div className={styles.pathGrid}>
                    <article className={styles.pathCard}>
                      <h3 className={styles.pathTitle}>Create menu from item library</h3>
                      <p className={styles.pathText}>
                        Compose a new menu by selecting from all catalog items already in your org.
                      </p>
                      <Button type="button" onPress={() => setActiveTab('items')}>
                        Open item library
                      </Button>
                    </article>

                    <article className={styles.pathCard}>
                      <h3 className={styles.pathTitle}>Import menu items</h3>
                      <p className={styles.pathText}>
                        Upload a spreadsheet to add or update menu items in your catalog.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onPress={() => navigate('/menus/import')}
                      >
                        Start import
                      </Button>
                    </article>
                  </div>
                </section>
              ) : (
                <section className={styles.catalogPanel}>
                  <p className={styles.summary}>
                    {menus.length === 1
                      ? '1 menu in your organization'
                      : `${menus.length} menus in your organization`}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Items</th>
                          <th>Status</th>
                          <th>Updated</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {menus.map((menu) => (
                          <tr key={menu.id}>
                            <td>
                              <button
                                type="button"
                                className={styles.rowLink}
                                onClick={() => setMenuDetailsID(menu.id)}
                              >
                                <span className={styles.itemName}>{menu.name}</span>
                              </button>
                              {menu.description ? (
                                <p className={styles.itemDescription}>{menu.description}</p>
                              ) : null}
                            </td>
                            <td>{typeof menu.item_count === 'number' ? menu.item_count : '—'}</td>
                            <td>
                              <span
                                className={styles.statusBadge}
                                data-active={menu.is_active !== false}
                              >
                                {menu.is_active === false ? 'Inactive' : 'Active'}
                              </span>
                            </td>
                            <td>{formatDate(menu.updated_at)}</td>
                            <td>
                              <div className={styles.inlineActions}>
                                <span title="Assign this menu to stores">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onPress={() => void handleOpenAssignMenu(menu)}
                                    isDisabled={
                                      cloningMenuID === menu.id || deleteMenuBusy || assignBusy
                                    }
                                  >
                                    Assign
                                  </Button>
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onPress={() => void handleCloneMenu(menu.id)}
                                  isDisabled={cloningMenuID === menu.id || deleteMenuBusy}
                                >
                                  {cloningMenuID === menu.id ? 'Cloning...' : 'Clone'}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onPress={() =>
                                    handleRequestDeleteMenu(menu.id, menu.name, menu.item_count)
                                  }
                                  isDisabled={cloningMenuID === menu.id || deleteMenuBusy}
                                >
                                  {deleteMenuBusy && deleteMenuTarget?.id === menu.id
                                    ? 'Deleting...'
                                    : 'Delete'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {menuDetailsID ? (
                    <div className={styles.detailPanel}>
                      <h3 className={styles.detailTitle}>Menu Details</h3>
                      {menuDetailsLoading ? (
                        <p className={styles.muted}>Loading menu details...</p>
                      ) : null}
                      {menuDetailsError ? <p className={styles.error}>{menuDetailsError}</p> : null}
                      {menuDetails ? (
                        <>
                          <p className={styles.muted}>
                            <strong>{menuDetails.name}</strong>
                            {menuDetails.description ? ` • ${menuDetails.description}` : ''}
                          </p>
                          <p className={styles.muted}>
                            Assigned items: {menuDetails.items.length} • Status:{' '}
                            {menuDetails.is_active === false ? 'Inactive' : 'Active'}
                          </p>
                          <div className={styles.tableWrap}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th>Item</th>
                                  <th>Price</th>
                                  <th>Assignment</th>
                                  <th>Variant Groups</th>
                                  <th>Modifier Groups</th>
                                  <th>Rules</th>
                                  <th>Soft Rules</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {menuDetails.items.map((entry, idx) => {
                                  const menuItem = asRecord(entry.menu_item);
                                  const menuItemID = readString(menuItem, 'id');
                                  const itemName = readString(menuItem, 'name') || 'Untitled item';
                                  const itemDescription = readString(menuItem, 'description');
                                  const itemPrice = readNumber(menuItem, 'base_price');
                                  const itemPriceUnit = readString(
                                    menuItem,
                                    'price_unit',
                                  ) as PriceUnit;
                                  const variantGroups = Array.isArray(menuItem['variant_groups'])
                                    ? menuItem['variant_groups'].length
                                    : 0;
                                  const modifierGroups = Array.isArray(menuItem['modifier_groups'])
                                    ? menuItem['modifier_groups'].length
                                    : 0;
                                  const rules = Array.isArray(menuItem['rules'])
                                    ? menuItem['rules'].length
                                    : 0;
                                  const softRules = Array.isArray(menuItem['soft_rules'])
                                    ? menuItem['soft_rules'].length
                                    : 0;
                                  const itemIsActive = readBool(menuItem, 'is_active', true);

                                  return (
                                    <tr key={`${menuDetails.id}-details-item-${idx}`}>
                                      <td>
                                        <p className={styles.itemName}>{itemName}</p>
                                        {itemDescription ? (
                                          <p className={styles.itemDescription}>
                                            {itemDescription}
                                          </p>
                                        ) : null}
                                      </td>
                                      <td>{formatPrice(itemPrice, itemPriceUnit || null)}</td>
                                      <td>
                                        <span
                                          className={styles.statusBadge}
                                          data-active={entry.is_active && itemIsActive}
                                        >
                                          {entry.is_active && itemIsActive ? 'Active' : 'Inactive'}
                                        </span>
                                      </td>
                                      <td>{variantGroups}</td>
                                      <td>{modifierGroups}</td>
                                      <td>{rules}</td>
                                      <td>{softRules}</td>
                                      <td>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onPress={() =>
                                            void handleRemoveItemFromFocusedMenu(
                                              menuItemID,
                                              itemName,
                                            )
                                          }
                                          isDisabled={!menuItemID || menuEditBusy}
                                        >
                                          {menuEditBusy ? 'Working...' : 'Remove'}
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className={styles.fieldRow}>
                            <h4 className={styles.sectionTitle}>Edit Menu Items</h4>
                            <p className={styles.muted}>
                              Add active catalog items to this menu, or remove current assignments.
                            </p>
                            {menuEditError ? <p className={styles.error}>{menuEditError}</p> : null}
                            {menuEditSuccess ? (
                              <p className={styles.success}>{menuEditSuccess}</p>
                            ) : null}
                            {addableItemsForMenu.length > 0 ? (
                              <label className={styles.inputLabel}>
                                Add item
                                <select
                                  className={styles.inputControl}
                                  value={menuDetailsAddItemID}
                                  onChange={(event) => setMenuDetailsAddItemID(event.target.value)}
                                >
                                  <option value="">Choose an item...</option>
                                  {addableItemsForMenu.map((item) => (
                                    <option
                                      key={`${menuDetails.id}-addable-${item.id}`}
                                      value={item.id}
                                    >
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <p className={styles.muted}>
                                No additional active items are available to add.
                              </p>
                            )}
                            <div className={styles.actions}>
                              <Button
                                type="button"
                                size="sm"
                                onPress={() => void handleAddItemToFocusedMenu()}
                                isDisabled={!menuDetailsAddItemID || menuEditBusy}
                              >
                                {menuEditBusy ? 'Working...' : 'Add to menu'}
                              </Button>
                            </div>
                          </div>
                          <div className={styles.actions}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onPress={() =>
                                handleRequestDeleteMenu(
                                  menuDetails.id,
                                  menuDetails.name,
                                  menuDetails.items.length,
                                )
                              }
                              isDisabled={deleteMenuBusy}
                            >
                              {deleteMenuBusy && deleteMenuTarget?.id === menuDetails.id
                                ? 'Deleting...'
                                : 'Delete menu'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onPress={() => setMenuDetailsID(null)}
                            >
                              Close details
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              )}
            </>
          ) : null}

          {activeTab === 'items' ? (
            <section className={styles.catalogPanel}>
              <p className={styles.summary}>
                {totalItems === 1
                  ? '1 item in your library'
                  : `${totalItems} items in your library`}
              </p>

              {itemDetailsID ? (
                <div className={styles.detailPanel} ref={itemDetailsPanelRef} tabIndex={-1}>
                  <h3 className={styles.detailTitle}>Menu Item Details</h3>
                  {itemDetailsLoading ? (
                    <p className={styles.muted}>Loading item details...</p>
                  ) : null}
                  {itemDetailsError ? <p className={styles.error}>{itemDetailsError}</p> : null}
                  {itemDetails ? (
                    <>
                      <p className={styles.muted}>
                        <strong>{itemDetails.name}</strong>
                        {itemDetails.description ? ` • ${itemDetails.description}` : ''}
                      </p>
                      <p className={styles.muted}>
                        Price: {formatPrice(itemDetails.base_price, itemDetails.price_unit)} •
                        Status: {itemDetails.is_active ? 'Active' : 'Inactive'}
                      </p>
                      <p className={styles.muted}>
                        SKU: {itemDetails.sku || '—'} • Serving:{' '}
                        {itemDetails.serving_description || '—'}
                      </p>
                      <p className={styles.muted}>
                        Dietary tags: {itemDetails.dietary_tags || '—'} • Allergens:{' '}
                        {itemDetails.allergens || '—'}
                      </p>

                      <div className={styles.fieldRow}>
                        <h4 className={styles.sectionTitle}>
                          Hard Rules ({itemDetails.rules.length})
                        </h4>
                        {itemDetails.rules.length === 0 ? (
                          <p className={styles.muted}>No hard rules.</p>
                        ) : (
                          <ul className={styles.detailList}>
                            {itemDetails.rules.map((rule, idx) => (
                              <li key={`${itemDetails.id}-rule-${idx}`}>
                                {rule.rule_type}: {rule.value}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className={styles.fieldRow}>
                        <h4 className={styles.sectionTitle}>
                          Soft Rules ({itemDetails.soft_rules.length})
                        </h4>
                        {itemDetails.soft_rules.length === 0 ? (
                          <p className={styles.muted}>No soft rules.</p>
                        ) : (
                          <ul className={styles.detailList}>
                            {itemDetails.soft_rules.map((rule) => (
                              <li key={rule.id}>
                                <strong>{rule.label}</strong>: {rule.content}{' '}
                                {rule.is_customer_visible ? '(Customer-visible)' : '(Internal)'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className={styles.fieldRow}>
                        <h4 className={styles.sectionTitle}>
                          Variant Groups ({itemDetails.variant_groups.length})
                        </h4>
                        {itemDetails.variant_groups.length === 0 ? (
                          <p className={styles.muted}>No variant groups.</p>
                        ) : (
                          <ul className={styles.detailList}>
                            {itemDetails.variant_groups.map((group) => (
                              <li key={group.id}>
                                <strong>{group.name}</strong> ({group.pricing_mode}) -{' '}
                                {group.options.length} option{group.options.length === 1 ? '' : 's'}
                                {group.options.length > 0
                                  ? `: ${group.options
                                      .map(
                                        (option) =>
                                          `${option.name} (${formatPrice(option.price, option.price_unit)})`,
                                      )
                                      .join(', ')}`
                                  : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className={styles.fieldRow}>
                        <h4 className={styles.sectionTitle}>
                          Modifier Groups ({itemDetails.modifier_groups.length})
                        </h4>
                        {itemDetails.modifier_groups.length === 0 ? (
                          <p className={styles.muted}>No modifier groups.</p>
                        ) : (
                          <ul className={styles.detailList}>
                            {itemDetails.modifier_groups.map((group) => (
                              <li key={group.id}>
                                <strong>{group.name}</strong> [{group.min_selections}-
                                {group.max_selections}] - {group.options.length} option
                                {group.options.length === 1 ? '' : 's'}
                                {group.options.length > 0
                                  ? `: ${group.options
                                      .map(
                                        (option) =>
                                          `${option.name} (${formatPrice(option.price, option.price_unit)})`,
                                      )
                                      .join(', ')}`
                                  : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className={styles.actions}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onPress={() => setItemDetailsID(null)}
                        >
                          Close details
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {hasItems ? (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Select</th>
                          <th>Name</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedItemSet.has(item.id)}
                                onChange={(event) =>
                                  toggleItemSelected(item.id, event.target.checked)
                                }
                                aria-label={`Select ${item.name}`}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.rowLink}
                                onClick={() => handleOpenItemDetails(item.id)}
                              >
                                <span className={styles.itemName}>{item.name}</span>
                              </button>
                              {item.description ? (
                                <p className={styles.itemDescription}>{item.description}</p>
                              ) : null}
                            </td>
                            <td>{categoryMap.get(item.id) ?? 'Uncategorized'}</td>
                            <td>{formatPrice(item.base_price, item.price_unit)}</td>
                            <td>
                              <span className={styles.statusBadge} data-active={item.is_active}>
                                {item.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onPress={() => handleOpenItemDetails(item.id)}
                                isDisabled={itemDetailsLoading && itemDetailsID === item.id}
                              >
                                {itemDetailsLoading && itemDetailsID === item.id
                                  ? 'Loading...'
                                  : 'Details'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details className={styles.secondaryPanel}>
                    <summary className={styles.secondarySummary}>
                      Compose menu from selected items
                    </summary>
                    <p className={styles.muted}>
                      Optional. This tab stays focused on your item library.
                    </p>
                    <div className={styles.fieldRow}>
                      <label className={styles.inputLabel}>
                        Menu name
                        <input
                          type="text"
                          className={styles.inputControl}
                          value={menuName}
                          onChange={(event) => setMenuName(event.target.value)}
                          placeholder="Weekday Lunch Menu"
                        />
                      </label>
                      <label className={styles.inputLabel}>
                        Description (optional)
                        <input
                          type="text"
                          className={styles.inputControl}
                          value={menuDescription}
                          onChange={(event) => setMenuDescription(event.target.value)}
                          placeholder="Internal notes for this menu"
                        />
                      </label>
                      <p className={styles.muted}>
                        Selected items: {selectedCount} / {items.length}
                      </p>
                      <div className={styles.actions}>
                        <Button type="button" variant="outline" size="sm" onPress={selectAllItems}>
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onPress={clearSelectedItems}
                        >
                          Clear
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onPress={() => void handleCreateMenuFromSelected()}
                          isDisabled={creatingMenu}
                        >
                          {creatingMenu ? 'Creating menu...' : 'Create menu'}
                        </Button>
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <section className={styles.emptyState}>
                  <h2 className={styles.emptyTitle}>No menu items yet</h2>
                  <p className={styles.emptyText}>
                    Import menu items from a spreadsheet, then come back to compose a menu.
                  </p>
                  <div className={styles.actions}>
                    <Button type="button" onPress={() => navigate('/menus/import')}>
                      Import menu items
                    </Button>
                  </div>
                </section>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        isOpen={assignMenuTarget !== null}
        title={assignMenuTarget ? `Assign "${assignMenuTarget.name}" to stores` : 'Assign menu'}
        description="Selected stores will have this menu assigned."
        details={
          <div className={styles.assignDialog}>
            {assignStoresLoading ? <p className={styles.muted}>Loading stores...</p> : null}
            {!assignStoresLoading && assignStoresError ? (
              <p className={styles.error} role="alert">
                {assignStoresError}
              </p>
            ) : null}
            {!assignStoresLoading && !assignStoresError ? (
              <>
                {assignAllStores.length === 0 ? (
                  <p className={styles.muted}>No stores available yet.</p>
                ) : (
                  <>
                    <p className={styles.assignSummary}>
                      Selected {assignSelectedStoreIDs.length} of {assignAllStores.length} stores
                    </p>
                    <div className={styles.inlineActions}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onPress={() =>
                          setAssignSelectedStoreIDs(assignAllStores.map((store) => store.id))
                        }
                        isDisabled={assignBusy || assignAllStores.length === 0}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onPress={() => setAssignSelectedStoreIDs([])}
                        isDisabled={assignBusy || assignSelectedStoreIDs.length === 0}
                      >
                        Clear
                      </Button>
                    </div>
                    <ul className={styles.assignStoreList}>
                      {assignAllStores.map((store) => (
                        <li key={store.id} className={styles.assignStoreRow}>
                          <label className={styles.assignStoreLabel}>
                            <input
                              type="checkbox"
                              checked={assignSelectedStoreSet.has(store.id)}
                              onChange={(event) =>
                                toggleAssignStoreSelected(store.id, event.target.checked)
                              }
                              disabled={assignBusy}
                            />
                            <span>{store.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : null}
          </div>
        }
        confirmLabel="Save assignments"
        onConfirm={() => void handleConfirmAssignMenu()}
        onCancel={handleCancelAssignMenu}
        loading={assignBusy}
        error={assignError}
      />

      <ConfirmDialog
        isOpen={deleteMenuTarget !== null}
        title={deleteMenuTarget ? `Delete "${deleteMenuTarget.name}"?` : 'Delete menu?'}
        description="This permanently deletes the menu and its assignments."
        details={
          deleteMenuTarget ? (
            <p>Assigned items: {deleteMenuTarget.itemCount ?? 0}. This action cannot be undone.</p>
          ) : undefined
        }
        confirmLabel="Delete menu"
        onConfirm={() => void handleConfirmDeleteMenu()}
        onCancel={handleCancelDeleteMenu}
        loading={deleteMenuBusy}
        error={deleteMenuError}
      />
    </div>
  );
}
