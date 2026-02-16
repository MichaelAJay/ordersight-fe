import { beforeEach, describe, expect, test, vi } from 'vitest';

const getJSONMock = vi.fn();

vi.mock('../http', () => ({
  getJSON: (...args: unknown[]) => getJSONMock(...args),
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
});
