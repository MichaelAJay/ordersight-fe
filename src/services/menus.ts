import { getJSON } from './http';

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
  const id = normalizeString(record.id);
  const name = normalizeString(record.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    org_id: normalizeOptionalString(record.org_id) ?? undefined,
    name,
    description: normalizeOptionalString(record.description),
    is_active: typeof record.is_active === 'boolean' ? record.is_active : undefined,
    item_count:
      typeof record.item_count === 'number' && Number.isInteger(record.item_count)
        ? record.item_count
        : undefined,
    created_at: normalizeOptionalString(record.created_at) ?? undefined,
    updated_at: normalizeOptionalString(record.updated_at) ?? undefined,
  };
}

function normalizeMenuDetail(value: unknown): MenuDetail | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const name = normalizeString(record.name);
  if (!id || !name) {
    return null;
  }

  const items = Array.isArray(record.items)
    ? record.items
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const itemRecord = entry as Record<string, unknown>;
          return {
            menu_item:
              itemRecord.menu_item && typeof itemRecord.menu_item === 'object'
                ? (itemRecord.menu_item as Record<string, unknown>)
                : {},
            is_active: itemRecord.is_active !== false,
            sort_order:
              typeof itemRecord.sort_order === 'number' && Number.isInteger(itemRecord.sort_order)
                ? itemRecord.sort_order
                : 0,
          };
        })
    : [];

  return {
    id,
    org_id: normalizeOptionalString(record.org_id) ?? undefined,
    name,
    description: normalizeOptionalString(record.description),
    is_active: typeof record.is_active === 'boolean' ? record.is_active : undefined,
    items,
    created_at: normalizeOptionalString(record.created_at) ?? undefined,
    updated_at: normalizeOptionalString(record.updated_at) ?? undefined,
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
