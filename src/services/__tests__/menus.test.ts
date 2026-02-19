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
});
