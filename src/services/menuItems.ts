import { getJSON } from './http';

export type PriceUnit = 'flat' | 'per_person' | 'per_unit' | string;

export interface MenuItem {
  id: string;
  name: string;
  category_id: string | null;
  description: string | null;
  base_price: number | null;
  price_unit: PriceUnit | null;
  is_active: boolean;
}

export interface ListMenuItemsResult {
  items: MenuItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListMenuItemsInput {
  limit?: number;
  offset?: number;
  is_active?: boolean;
  category_id?: string;
  search?: string;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
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

function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeMenuItem(value: unknown): MenuItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record['id']);
  const name = normalizeString(record['name']);

  if (!id || !name) {
    return null;
  }

  const basePrice =
    typeof record['base_price'] === 'number' && Number.isInteger(record['base_price'])
      ? record['base_price']
      : null;

  return {
    id,
    name,
    category_id: normalizeOptionalString(record['category_id']),
    description: normalizeOptionalString(record['description']),
    base_price: basePrice,
    price_unit: normalizeOptionalString(record['price_unit']),
    is_active: record['is_active'] !== false,
  };
}

function normalizeMenuItemList(payload: unknown, fallbackLimit: number): ListMenuItemsResult {
  if (!payload || typeof payload !== 'object') {
    return { items: [], total: 0, limit: fallbackLimit, offset: 0 };
  }

  const record = payload as Record<string, unknown>;
  const rawItems = Array.isArray(record['items']) ? record['items'] : [];
  const items: MenuItem[] = [];

  for (const entry of rawItems) {
    const normalized = normalizeMenuItem(entry);
    if (normalized) {
      items.push(normalized);
    }
  }

  return {
    items,
    total: normalizeNonNegativeInt(record['total'], items.length),
    limit: normalizeNonNegativeInt(record['limit'], fallbackLimit),
    offset: normalizeNonNegativeInt(record['offset'], 0),
  };
}

function buildListMenuItemsUrl(input?: ListMenuItemsInput): string {
  const params = new URLSearchParams();

  if (typeof input?.limit === 'number' && Number.isInteger(input.limit) && input.limit > 0) {
    params.set('limit', String(input.limit));
  }
  if (typeof input?.offset === 'number' && Number.isInteger(input.offset) && input.offset >= 0) {
    params.set('offset', String(input.offset));
  }
  if (typeof input?.is_active === 'boolean') {
    params.set('is_active', String(input.is_active));
  }
  if (typeof input?.category_id === 'string' && input.category_id.trim()) {
    params.set('category_id', input.category_id.trim());
  }
  if (typeof input?.search === 'string' && input.search.trim()) {
    params.set('search', input.search.trim());
  }

  const query = params.toString();
  return query ? `/menu-items?${query}` : '/menu-items';
}

function normalizeCategory(value: unknown): Category | null {
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
    name,
    sort_order: normalizeNonNegativeInt(record['sort_order'], 0),
  };
}

function normalizeCategories(payload: unknown): Category[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const categories: Category[] = [];
  const seen = new Set<string>();

  for (const entry of payload) {
    const normalized = normalizeCategory(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    categories.push(normalized);
  }

  return categories;
}

export async function listMenuItems(input?: ListMenuItemsInput): Promise<ListMenuItemsResult> {
  const fallbackLimit =
    typeof input?.limit === 'number' && Number.isInteger(input.limit) && input.limit > 0
      ? input.limit
      : 50;
  const payload = await getJSON<unknown>(buildListMenuItemsUrl(input));
  return normalizeMenuItemList(payload, fallbackLimit);
}

export async function listCategories(): Promise<Category[]> {
  const payload = await getJSON<unknown>('/categories');
  return normalizeCategories(payload);
}
