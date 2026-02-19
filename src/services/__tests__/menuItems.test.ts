import { beforeEach, describe, expect, test, vi } from 'vitest';

const getJSONMock = vi.fn();

vi.mock('../http', () => ({
  getJSON: (...args: unknown[]) => getJSONMock(...args),
}));

describe('menuItems service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('lists menu items from /menu-items and normalizes response', async () => {
    getJSONMock.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          name: 'Turkey Club',
          category_id: 'cat-1',
          description: 'Served with chips',
          base_price: 1399,
          price_unit: 'flat',
          is_active: true,
        },
        {
          id: 'item-2',
          name: 'Large Salad',
          category_id: null,
          description: '',
          base_price: null,
          price_unit: null,
          is_active: false,
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    const { listMenuItems } = await import('../menuItems');
    const result = await listMenuItems({ limit: 100, offset: 0, search: 'club' });

    expect(getJSONMock).toHaveBeenCalledWith('/menu-items?limit=100&offset=0&search=club');
    expect(result).toEqual({
      items: [
        {
          id: 'item-1',
          name: 'Turkey Club',
          category_id: 'cat-1',
          description: 'Served with chips',
          base_price: 1399,
          price_unit: 'flat',
          is_active: true,
        },
        {
          id: 'item-2',
          name: 'Large Salad',
          category_id: null,
          description: null,
          base_price: null,
          price_unit: null,
          is_active: false,
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });
  });

  test('normalizes malformed list payload defensively', async () => {
    getJSONMock.mockResolvedValue({
      items: [
        { id: '', name: 'Missing id' },
        { id: 'item-1', name: '  Lunch Box  ', is_active: 'yes' },
      ],
      total: 'bad-total',
    });

    const { listMenuItems } = await import('../menuItems');
    const result = await listMenuItems();

    expect(result).toEqual({
      items: [
        {
          id: 'item-1',
          name: 'Lunch Box',
          category_id: null,
          description: null,
          base_price: null,
          price_unit: null,
          is_active: true,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
  });

  test('lists categories from /categories and removes invalid rows', async () => {
    getJSONMock.mockResolvedValue([
      { id: 'cat-1', name: 'Sandwiches', sort_order: 0 },
      { id: 'cat-1', name: 'Duplicate', sort_order: 1 },
      { id: '', name: 'Invalid' },
    ]);

    const { listCategories } = await import('../menuItems');
    const result = await listCategories();

    expect(getJSONMock).toHaveBeenCalledWith('/categories');
    expect(result).toEqual([{ id: 'cat-1', name: 'Sandwiches', sort_order: 0 }]);
  });

  test('gets menu item details from direct payload', async () => {
    getJSONMock.mockResolvedValue({
      id: 'item-1',
      name: 'Turkey Club',
      category_id: 'cat-1',
      description: 'Served with chips',
      base_price: 1399,
      price_unit: 'flat',
      is_active: true,
      rules: [{ rule_type: 'service_style', value: 'hot' }],
      soft_rules: [],
      variant_groups: [],
      modifier_groups: [],
    });

    const { getMenuItemById } = await import('../menuItems');
    const result = await getMenuItemById('item-1');

    expect(getJSONMock).toHaveBeenCalledWith('/menu-items/item-1');
    expect(result?.id).toBe('item-1');
    expect(result?.rules).toHaveLength(1);
    expect(result?.rules[0]).toEqual({ rule_type: 'service_style', value: 'hot' });
  });

  test('gets menu item details from wrapped payload', async () => {
    getJSONMock.mockResolvedValue({
      data: {
        id: 'item-2',
        name: 'Large Salad',
        category_id: null,
        description: '',
        base_price: 1099,
        price_unit: 'flat',
        is_active: true,
        rules: [],
        soft_rules: [
          { id: 'soft-1', label: 'Kitchen', content: 'No croutons', is_customer_visible: false },
        ],
        variant_groups: [],
        modifier_groups: [],
      },
    });

    const { getMenuItemById } = await import('../menuItems');
    const result = await getMenuItemById('item-2');

    expect(getJSONMock).toHaveBeenCalledWith('/menu-items/item-2');
    expect(result?.id).toBe('item-2');
    expect(result?.soft_rules).toHaveLength(1);
    expect(result?.soft_rules[0].label).toBe('Kitchen');
  });
});
