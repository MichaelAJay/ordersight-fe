import { getJSON } from './http';

export interface Menu {
  id: string;
  org_id?: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

type MenuApiRecord = {
  id?: string;
  org_id?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
};

function toMenu(record: MenuApiRecord, index: number): Menu {
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : `menu-${index + 1}`,
    org_id: typeof record.org_id === 'string' ? record.org_id : undefined,
    name:
      typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Untitled menu',
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
  };
}

function normalizeMenuPayload(payload: unknown): Menu[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry, index) => toMenu(entry as MenuApiRecord, index));
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const menusValue = (payload as { menus?: unknown }).menus;
  if (!Array.isArray(menusValue)) {
    return [];
  }

  return menusValue
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => toMenu(entry as MenuApiRecord, index));
}

export async function listMenus(): Promise<Menu[]> {
  const response = await getJSON<unknown>('/menus');
  return normalizeMenuPayload(response);
}
