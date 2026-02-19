import { delJSON, getJSON, postJSON } from './http';

export interface MenuSummary {
  id: string;
  org_id?: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  item_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StoreMenuSummary {
  id: string;
  org_id?: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  is_primary?: boolean;
  assigned_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StoreMenuAssignment {
  store_id: string;
  menu_id: string;
  is_primary: boolean;
  created_at?: string;
}

export interface MenuStoreSummary {
  store_id: string;
  org_id?: string;
  name: string;
  is_primary?: boolean;
  assigned_at?: string;
}

export interface AssignMenuStoresBulkResponse {
  results: StoreMenuAssignment[];
}

export interface MenuDetail {
  id: string;
  org_id?: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  items: Array<{
    menu_item: Record<string, unknown>;
    is_active: boolean;
    sort_order: number;
  }>;
  created_at?: string;
  updated_at?: string;
}

export interface CreateMenuRequest {
  name: string;
  description?: string | null;
}

export interface MenuItemAssignmentResult {
  menu_id: string;
  menu_item_id: string;
  is_active: boolean;
  sort_order: number;
}

export interface AssignMenuItemsResponse {
  results: MenuItemAssignmentResult[];
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeMenuSummary(value: unknown): MenuSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    org_id: normalizeOptionalString(record['org_id']) ?? undefined,
    name,
    description: normalizeOptionalString(record['description']),
    is_active: typeof record['is_active'] === 'boolean' ? record['is_active'] : undefined,
    item_count:
      typeof record['item_count'] === 'number' && Number.isInteger(record['item_count'])
        ? record['item_count']
        : undefined,
    created_at: normalizeOptionalString(record['created_at']) ?? undefined,
    updated_at: normalizeOptionalString(record['updated_at']) ?? undefined,
  };
}

function normalizeMenuDetail(value: unknown): MenuDetail | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);
  if (!id || !name) {
    return null;
  }

  const items = Array.isArray(record['items'])
    ? record['items']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const itemRecord = entry as Record<string, unknown>;
          return {
            menu_item:
              itemRecord['menu_item'] && typeof itemRecord['menu_item'] === 'object'
                ? (itemRecord['menu_item'] as Record<string, unknown>)
                : {},
            is_active: itemRecord['is_active'] !== false,
            sort_order:
              typeof itemRecord['sort_order'] === 'number' &&
              Number.isInteger(itemRecord['sort_order'])
                ? itemRecord['sort_order']
                : 0,
          };
        })
    : [];

  return {
    id,
    org_id: normalizeOptionalString(record['org_id']) ?? undefined,
    name,
    description: normalizeOptionalString(record['description']),
    is_active: typeof record['is_active'] === 'boolean' ? record['is_active'] : undefined,
    items,
    created_at: normalizeOptionalString(record['created_at']) ?? undefined,
    updated_at: normalizeOptionalString(record['updated_at']) ?? undefined,
  };
}

function normalizeStoreMenuSummary(value: unknown): StoreMenuSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    org_id: normalizeOptionalString(record['org_id']) ?? undefined,
    name,
    description: normalizeOptionalString(record['description']),
    is_active: typeof record['is_active'] === 'boolean' ? record['is_active'] : undefined,
    is_primary: typeof record['is_primary'] === 'boolean' ? record['is_primary'] : undefined,
    assigned_at: normalizeOptionalString(record['assigned_at']) ?? undefined,
    created_at: normalizeOptionalString(record['created_at']) ?? undefined,
    updated_at: normalizeOptionalString(record['updated_at']) ?? undefined,
  };
}

function normalizeStoreMenuAssignment(value: unknown): StoreMenuAssignment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const storeID = normalizeString(record['store_id']);
  const menuID = normalizeString(record['menu_id']);
  if (!storeID || !menuID) {
    return null;
  }

  return {
    store_id: storeID,
    menu_id: menuID,
    is_primary: record['is_primary'] === true,
    created_at: normalizeOptionalString(record['created_at']) ?? undefined,
  };
}

function normalizeMenuStoreSummary(value: unknown): MenuStoreSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const storeID = normalizeString(record['store_id']);
  const name = normalizeString(record['name']);
  if (!storeID || !name) {
    return null;
  }

  return {
    store_id: storeID,
    org_id: normalizeOptionalString(record['org_id']) ?? undefined,
    name,
    is_primary: typeof record['is_primary'] === 'boolean' ? record['is_primary'] : undefined,
    assigned_at: normalizeOptionalString(record['assigned_at']) ?? undefined,
  };
}

export async function listMenus(): Promise<MenuSummary[]> {
  const payload = await getJSON<unknown>('/menus');
  if (!Array.isArray(payload)) {
    return [];
  }

  const menus: MenuSummary[] = [];
  const seen = new Set<string>();
  for (const entry of payload) {
    const normalized = normalizeMenuSummary(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    menus.push(normalized);
  }
  return menus;
}

export async function getMenuById(menuID: string): Promise<MenuDetail | null> {
  const payload = await getJSON<unknown>(`/menus/${menuID}`);
  return normalizeMenuDetail(payload);
}

export async function listStoreMenus(storeID: string): Promise<StoreMenuSummary[]> {
  const payload = await getJSON<unknown>(`/stores/${storeID}/menus`);
  if (!Array.isArray(payload)) {
    return [];
  }

  const menus: StoreMenuSummary[] = [];
  const seen = new Set<string>();
  for (const entry of payload) {
    const normalized = normalizeStoreMenuSummary(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    menus.push(normalized);
  }
  return menus;
}

export async function listMenuStores(menuID: string): Promise<MenuStoreSummary[]> {
  const payload = await getJSON<unknown>(`/menus/${menuID}/stores`);
  if (!Array.isArray(payload)) {
    return [];
  }

  const stores: MenuStoreSummary[] = [];
  const seen = new Set<string>();
  for (const entry of payload) {
    const normalized = normalizeMenuStoreSummary(entry);
    if (!normalized || seen.has(normalized.store_id)) {
      continue;
    }
    seen.add(normalized.store_id);
    stores.push(normalized);
  }
  return stores;
}

export async function createMenu(payload: CreateMenuRequest): Promise<MenuSummary | null> {
  const body = {
    name: payload.name,
    description: payload.description ?? null,
  };
  const created = await postJSON<typeof body, unknown>('/menus', body);
  return normalizeMenuSummary(created);
}

export async function assignMenuItems(
  menuID: string,
  menuItemIDs: string[],
): Promise<AssignMenuItemsResponse> {
  const payload = menuItemIDs.map((menuItemID) => ({
    menu_item_id: menuItemID,
  }));
  const response = await postJSON<typeof payload, unknown>(`/menus/${menuID}/items`, payload);
  const record =
    response && typeof response === 'object' && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : {};
  const resultsRaw = Array.isArray(record['results']) ? record['results'] : [];
  const results: MenuItemAssignmentResult[] = resultsRaw
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        menu_id: normalizeString(row['menu_id']),
        menu_item_id: normalizeString(row['menu_item_id']),
        is_active: row['is_active'] !== false,
        sort_order:
          typeof row['sort_order'] === 'number' && Number.isInteger(row['sort_order'])
            ? row['sort_order']
            : 0,
      };
    })
    .filter((row) => row.menu_id.length > 0 && row.menu_item_id.length > 0);

  return { results };
}

export async function removeMenuItemAssignment(menuID: string, menuItemID: string): Promise<void> {
  await delJSON<unknown>(`/menus/${menuID}/items/${menuItemID}`);
}

export async function assignStoreMenu(
  storeID: string,
  menuID: string,
): Promise<StoreMenuAssignment | null> {
  const response = await postJSON<{ menu_id: string }, unknown>(`/stores/${storeID}/menus`, {
    menu_id: menuID,
  });
  return normalizeStoreMenuAssignment(response);
}

export async function assignMenuStoresBulk(
  menuID: string,
  storeIDs: string[],
): Promise<AssignMenuStoresBulkResponse> {
  const payload = storeIDs.map((storeID) => ({
    store_id: storeID,
  }));
  const response = await postJSON<typeof payload, unknown>(`/menus/${menuID}/stores/bulk`, payload);
  const record =
    response && typeof response === 'object' && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : {};
  const resultsRaw = Array.isArray(record['results']) ? record['results'] : [];
  const results: StoreMenuAssignment[] = [];
  for (const entry of resultsRaw) {
    const normalized = normalizeStoreMenuAssignment(entry);
    if (!normalized) {
      continue;
    }
    results.push(normalized);
  }
  return { results };
}

export async function removeStoreMenu(storeID: string, menuID: string): Promise<void> {
  await delJSON<unknown>(`/stores/${storeID}/menus/${menuID}`);
}

export async function deleteMenu(menuID: string): Promise<void> {
  await delJSON<unknown>(`/menus/${menuID}`);
}
