import { getJSON, postJSON } from './http';

export type StoreStatus = 'active' | 'paused' | 'archived' | string;

export interface Store {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status?: StoreStatus;
  location?: string | null;
  descriptor?: string | null;
}

export async function listStores(): Promise<Store[]> {
  return getJSON<Store[]>('/stores');
}

export async function getStore(storeId: string): Promise<Store> {
  return getJSON<Store>(`/stores/${storeId}`);
}

export interface CreateStoreRequest {
  name: string;
}

export async function createStore(payload: CreateStoreRequest): Promise<Store> {
  return postJSON<CreateStoreRequest, Store>('/stores', payload);
}

export type StoreOpenOrdersMap = Record<string, number>;

type OpenOrdersEntry = {
  store_id?: string;
  storeId?: string;
  id?: string;
  open_orders?: number;
  openOrders?: number;
  open_order_count?: number;
  count?: number;
};

function getOpenOrdersCount(entry: OpenOrdersEntry | Record<string, unknown>): number | null {
  const count =
    entry.open_orders ?? entry.openOrders ?? entry.open_order_count ?? entry.count ?? null;
  return typeof count === 'number' ? count : null;
}

function normalizeOpenOrders(data: unknown): StoreOpenOrdersMap {
  if (!data || typeof data !== 'object') return {};

  if (Array.isArray(data)) {
    const map: StoreOpenOrdersMap = {};
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as OpenOrdersEntry;
      const storeId = entry.store_id ?? entry.storeId ?? entry.id;
      const count = getOpenOrdersCount(entry);
      if (typeof storeId === 'string' && typeof count === 'number') {
        map[storeId] = count;
      }
    }
    return map;
  }

  const record = data as Record<string, unknown>;
  const nestedStores = record['stores'];
  if (Array.isArray(nestedStores)) {
    return normalizeOpenOrders(nestedStores);
  }

  const map: StoreOpenOrdersMap = {};
  for (const [storeId, value] of Object.entries(record)) {
    if (typeof value === 'number') {
      map[storeId] = value;
      continue;
    }
    if (value && typeof value === 'object') {
      const count = getOpenOrdersCount(value as Record<string, unknown>);
      if (typeof count === 'number') {
        map[storeId] = count;
      }
    }
  }

  return map;
}

export async function listStoreOpenOrders(): Promise<StoreOpenOrdersMap> {
  const response = await getJSON<unknown>('/stores/open-orders');
  return normalizeOpenOrders(response);
}
