import { beforeEach, describe, expect, test, vi } from 'vitest';

const getJSONMock = vi.fn();
const postJSONMock = vi.fn();
const delJSONMock = vi.fn();

vi.mock('../http', () => ({
  getJSON: (...args: unknown[]) => getJSONMock(...args),
  postJSON: (...args: unknown[]) => postJSONMock(...args),
  delJSON: (...args: unknown[]) => delJSONMock(...args),
}));

describe('menus service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('lists menus from /menus', async () => {
    getJSONMock.mockResolvedValue([
      {
        id: 'menu-1',
        org_id: 'org-1',
        name: 'Catering Core',
        is_active: true,
        item_count: 14,
      },
    ]);

    const { listMenus } = await import('../menus');
    const result = await listMenus();

    expect(getJSONMock).toHaveBeenCalledWith('/menus');
    expect(result).toEqual([
      {
        id: 'menu-1',
        org_id: 'org-1',
        name: 'Catering Core',
        description: null,
        is_active: true,
        item_count: 14,
        created_at: undefined,
        updated_at: undefined,
      },
    ]);
  });

  test('loads menu detail from /menus/:id', async () => {
    getJSONMock.mockResolvedValue({
      id: 'menu-7',
      org_id: 'org-1',
      name: 'Weekday Lunch',
      is_active: true,
      items: [
        {
          menu_item: {
            id: 'item-1',
            name: 'Turkey Club',
          },
          is_active: true,
          sort_order: 2,
        },
      ],
    });

    const { getMenuById } = await import('../menus');
    const result = await getMenuById('menu-7');

    expect(getJSONMock).toHaveBeenCalledWith('/menus/menu-7');
    expect(result).toEqual({
      id: 'menu-7',
      org_id: 'org-1',
      name: 'Weekday Lunch',
      description: null,
      is_active: true,
      items: [
        {
          menu_item: {
            id: 'item-1',
            name: 'Turkey Club',
          },
          is_active: true,
          sort_order: 2,
        },
      ],
      created_at: undefined,
      updated_at: undefined,
    });
  });

  test('lists store menus from /stores/:id/menus', async () => {
    getJSONMock.mockResolvedValue([
      {
        id: 'menu-2',
        org_id: 'org-1',
        name: 'Store Lunch',
        is_active: true,
        is_primary: false,
        assigned_at: '2026-02-01T15:04:05Z',
      },
    ]);

    const { listStoreMenus } = await import('../menus');
    const result = await listStoreMenus('store-77');

    expect(getJSONMock).toHaveBeenCalledWith('/stores/store-77/menus');
    expect(result).toEqual([
      {
        id: 'menu-2',
        org_id: 'org-1',
        name: 'Store Lunch',
        description: null,
        is_active: true,
        is_primary: false,
        assigned_at: '2026-02-01T15:04:05Z',
        created_at: undefined,
        updated_at: undefined,
      },
    ]);
  });

  test('lists menu stores from /menus/:id/stores', async () => {
    getJSONMock.mockResolvedValue([
      {
        store_id: 'store-77',
        org_id: 'org-1',
        name: 'Downtown',
        is_primary: false,
        assigned_at: '2026-02-01T15:04:05Z',
      },
    ]);

    const { listMenuStores } = await import('../menus');
    const result = await listMenuStores('menu-2');

    expect(getJSONMock).toHaveBeenCalledWith('/menus/menu-2/stores');
    expect(result).toEqual([
      {
        store_id: 'store-77',
        org_id: 'org-1',
        name: 'Downtown',
        is_primary: false,
        assigned_at: '2026-02-01T15:04:05Z',
      },
    ]);
  });

  test('creates a menu via /menus', async () => {
    postJSONMock.mockResolvedValue({
      id: 'menu-9',
      name: 'Dinner',
      description: 'After-hours',
      is_active: true,
    });

    const { createMenu } = await import('../menus');
    const result = await createMenu({ name: 'Dinner', description: 'After-hours' });

    expect(postJSONMock).toHaveBeenCalledWith('/menus', {
      name: 'Dinner',
      description: 'After-hours',
    });
    expect(result?.id).toBe('menu-9');
    expect(result?.name).toBe('Dinner');
  });

  test('assigns menu items via /menus/:id/items', async () => {
    postJSONMock.mockResolvedValue({
      results: [
        {
          menu_id: 'menu-7',
          menu_item_id: 'item-1',
          is_active: true,
          sort_order: 0,
        },
      ],
    });

    const { assignMenuItems } = await import('../menus');
    const result = await assignMenuItems('menu-7', ['item-1']);

    expect(postJSONMock).toHaveBeenCalledWith('/menus/menu-7/items', [{ menu_item_id: 'item-1' }]);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.menu_item_id).toBe('item-1');
  });

  test('removes menu-item assignment via /menus/:id/items/:item_id', async () => {
    delJSONMock.mockResolvedValue({});
    const { removeMenuItemAssignment } = await import('../menus');
    await removeMenuItemAssignment('menu-7', 'item-3');
    expect(delJSONMock).toHaveBeenCalledWith('/menus/menu-7/items/item-3');
  });

  test('deletes menu via /menus/:id', async () => {
    delJSONMock.mockResolvedValue({});
    const { deleteMenu } = await import('../menus');
    await deleteMenu('menu-11');
    expect(delJSONMock).toHaveBeenCalledWith('/menus/menu-11');
  });

  test('assigns menu to store via /stores/:id/menus', async () => {
    postJSONMock.mockResolvedValue({
      store_id: 'store-77',
      menu_id: 'menu-2',
      is_primary: false,
    });

    const { assignStoreMenu } = await import('../menus');
    const result = await assignStoreMenu('store-77', 'menu-2');

    expect(postJSONMock).toHaveBeenCalledWith('/stores/store-77/menus', { menu_id: 'menu-2' });
    expect(result).toEqual({
      store_id: 'store-77',
      menu_id: 'menu-2',
      is_primary: false,
      created_at: undefined,
    });
  });

  test('assigns menu to multiple stores via /menus/:id/stores/bulk', async () => {
    postJSONMock.mockResolvedValue({
      results: [
        {
          store_id: 'store-77',
          menu_id: 'menu-2',
          is_primary: false,
        },
        {
          store_id: 'store-88',
          menu_id: 'menu-2',
          is_primary: false,
        },
      ],
    });

    const { assignMenuStoresBulk } = await import('../menus');
    const result = await assignMenuStoresBulk('menu-2', ['store-77', 'store-88']);

    expect(postJSONMock).toHaveBeenCalledWith('/menus/menu-2/stores/bulk', [
      { store_id: 'store-77' },
      { store_id: 'store-88' },
    ]);
    expect(result).toEqual({
      results: [
        {
          store_id: 'store-77',
          menu_id: 'menu-2',
          is_primary: false,
          created_at: undefined,
        },
        {
          store_id: 'store-88',
          menu_id: 'menu-2',
          is_primary: false,
          created_at: undefined,
        },
      ],
    });
  });

  test('removes store-menu assignment via /stores/:id/menus/:menuId', async () => {
    delJSONMock.mockResolvedValue({});
    const { removeStoreMenu } = await import('../menus');
    await removeStoreMenu('store-77', 'menu-2');
    expect(delJSONMock).toHaveBeenCalledWith('/stores/store-77/menus/menu-2');
  });
});
