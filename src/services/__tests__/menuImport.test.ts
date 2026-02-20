import { beforeEach, describe, expect, test, vi } from 'vitest';

const postJSONMock = vi.fn();
const apiPostMock = vi.fn();
const getJSONMock = vi.fn();
const patchJSONMock = vi.fn();
const delJSONMock = vi.fn();

vi.mock('../http', () => ({
  api: {
    post: (...args: unknown[]) => apiPostMock(...args),
  },
  getJSON: (...args: unknown[]) => getJSONMock(...args),
  postJSON: (...args: unknown[]) => postJSONMock(...args),
  patchJSON: (...args: unknown[]) => patchJSONMock(...args),
  delJSON: (...args: unknown[]) => delJSONMock(...args),
}));

describe('menuImport service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('uploads CSV to /imports/csv/upload', async () => {
    apiPostMock.mockResolvedValue({
      data: {
        import_session_id: 'session-1',
        column_names: ['Name', 'Price'],
        preview_rows: [{ Name: 'Turkey Club', Price: '12.00' }],
        total_row_count: 1,
      },
    });

    const file = new File(['Name,Price\nTurkey Club,12.00'], 'menu.csv', {
      type: 'text/csv',
    });

    const { uploadMenuImportCSV } = await import('../menuImport');
    const result = await uploadMenuImportCSV(file);

    expect(apiPostMock).toHaveBeenCalledWith('/imports/csv/upload', expect.any(FormData));
    expect(result.import_session_id).toBe('session-1');
    expect(result.column_names).toEqual(['Name', 'Price']);
    expect(result.total_row_count).toBe(1);
  });

  test('maps CSV columns with /imports/csv/:session/map', async () => {
    postJSONMock.mockResolvedValue({
      row_errors: [{ row: 2, errors: ['price is invalid'] }],
      validated_preview: [{ row: 1, name: 'Turkey Club', price: 1200, price_unit: 'flat' }],
      modifier_groups: [{ group_name: 'Add-ons', exists: false }],
      mapped_columns: [
        { field: 'required.name', column: 'Item Name', sample_values: ['Turkey Club'] },
      ],
      remaining_columns: [{ column: 'Add-ons', sample_values: ['Extra Mayo'] }],
    });

    const { mapMenuImportCSV } = await import('../menuImport');
    const result = await mapMenuImportCSV('session-1', {
      required: {
        name: 'Item Name',
        price: 'Item Price',
      },
      optional: {
        description: 'Description',
      },
      modifiers: [{ column: 'Add-ons', group_name: 'Add-ons' }],
      external_provider_mappings: [
        {
          column: 'EZ Item ID',
          provider_key: 'ezcater',
          external_field: 'external_item_key',
          make_active: true,
        },
      ],
    });

    expect(postJSONMock).toHaveBeenCalledWith('/imports/csv/session-1/map', {
      required: { name: 'Item Name', price: 'Item Price' },
      optional: { description: 'Description' },
      modifiers: [{ column: 'Add-ons', group_name: 'Add-ons' }],
      external_provider_mappings: [
        {
          column: 'EZ Item ID',
          provider_key: 'ezcater',
          external_field: 'external_item_key',
          make_active: true,
        },
      ],
    });
    expect(result.row_errors).toHaveLength(1);
    expect(result.validated_preview).toHaveLength(1);
    expect(result.modifier_groups[0]).toEqual({ group_name: 'Add-ons', exists: false });
    expect(result.mapped_columns[0]).toEqual({
      field: 'required.name',
      column: 'Item Name',
      sample_values: ['Turkey Club'],
    });
    expect(result.remaining_columns[0]).toEqual({
      column: 'Add-ons',
      sample_values: ['Extra Mayo'],
    });
  });

  test('lists provider catalog with /imports/providers', async () => {
    getJSONMock.mockResolvedValue({
      providers: [
        {
          provider_key: 'ezcater',
          label: 'EZCater',
          is_org_active: false,
          is_org_configured: true,
        },
        {
          provider_key: 'doordash',
          label: 'DoorDash',
          is_org_active: true,
          is_org_configured: true,
        },
      ],
    });

    const { listMenuImportProviders } = await import('../menuImport');
    const result = await listMenuImportProviders();

    expect(getJSONMock).toHaveBeenCalledWith('/imports/providers');
    expect(result).toEqual([
      {
        provider_key: 'ezcater',
        label: 'EZCater',
        is_org_active: false,
        is_org_configured: true,
      },
      {
        provider_key: 'doordash',
        label: 'DoorDash',
        is_org_active: true,
        is_org_configured: true,
      },
    ]);
  });

  test('commits CSV import with /imports/csv/:session/commit', async () => {
    postJSONMock.mockResolvedValue({
      created_count: 4,
      updated_count: 2,
      error_count: 0,
      errors: [],
    });

    const { commitMenuImportCSV } = await import('../menuImport');
    const result = await commitMenuImportCSV('session-1');

    expect(postJSONMock).toHaveBeenCalledWith('/imports/csv/session-1/commit', undefined);
    expect(result).toMatchObject({
      created_count: 4,
      updated_count: 2,
      error_count: 0,
      errors: [],
    });
  });

  test('commits CSV import and creates a menu when create_menu is set', async () => {
    postJSONMock.mockResolvedValue({
      created_count: 2,
      updated_count: 0,
      error_count: 0,
      errors: [],
      created_menu_id: 'menu-77',
      assigned_item_count: 2,
    });

    const { commitMenuImportCSV } = await import('../menuImport');
    const result = await commitMenuImportCSV('session-2', {
      create_menu: {
        name: 'Lunch Menu',
        description: 'Imported in one pass',
      },
    });

    expect(postJSONMock).toHaveBeenCalledWith('/imports/csv/session-2/commit', {
      create_menu: {
        name: 'Lunch Menu',
        description: 'Imported in one pass',
      },
    });
    expect(result.created_menu_id).toBe('menu-77');
    expect(result.assigned_item_count).toBe(2);
  });

  test('lists saved mappings with /imports/mappings', async () => {
    getJSONMock.mockResolvedValue({
      mappings: [
        {
          id: 'map-1',
          org_id: 'org-1',
          name: 'Catering Sheet',
          mapping: {
            expected_columns: ['ItemName', 'Price'],
            field_mappings: { item_name: 'ItemName', base_price: 'Price' },
            modifier_group_bundles: [],
            remaining_decisions: {},
          },
          created_by: 'user-1',
          created_at: '2026-02-17T00:00:00Z',
          updated_at: '2026-02-17T00:00:00Z',
        },
      ],
    });

    const { listMenuImportMappings } = await import('../menuImport');
    const result = await listMenuImportMappings();

    expect(getJSONMock).toHaveBeenCalledWith('/imports/mappings');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Catering Sheet');
    expect(result[0].mapping.field_mappings.item_name).toBe('ItemName');
  });

  test('creates saved mapping with /imports/mappings', async () => {
    postJSONMock.mockResolvedValue({
      mapping: {
        id: 'map-2',
        org_id: 'org-1',
        name: 'Weekly Import',
        mapping: {
          expected_columns: ['ItemName', 'Price'],
          field_mappings: { item_name: 'ItemName', base_price: 'Price' },
          modifier_group_bundles: [],
          remaining_decisions: {},
        },
        created_by: 'user-1',
        created_at: '2026-02-17T00:00:00Z',
        updated_at: '2026-02-17T00:00:00Z',
      },
    });

    const { createMenuImportMapping } = await import('../menuImport');
    const result = await createMenuImportMapping('Weekly Import', {
      expected_columns: ['ItemName', 'Price'],
      field_mappings: { item_name: 'ItemName', base_price: 'Price' },
      modifier_group_bundles: [],
      remaining_decisions: {},
    });

    expect(postJSONMock).toHaveBeenCalledWith('/imports/mappings', {
      name: 'Weekly Import',
      mapping: {
        expected_columns: ['ItemName', 'Price'],
        field_mappings: { item_name: 'ItemName', base_price: 'Price' },
        modifier_group_bundles: [],
        remaining_decisions: {},
      },
    });
    expect(result.id).toBe('map-2');
  });

  test('renames and deletes saved mapping', async () => {
    patchJSONMock.mockResolvedValue({
      mapping: {
        id: 'map-2',
        org_id: 'org-1',
        name: 'Renamed Mapping',
        mapping: {
          expected_columns: [],
          field_mappings: {},
          modifier_group_bundles: [],
          remaining_decisions: {},
        },
        created_by: 'user-1',
        created_at: '2026-02-17T00:00:00Z',
        updated_at: '2026-02-17T00:00:00Z',
      },
    });
    delJSONMock.mockResolvedValue({});

    const { renameMenuImportMapping, deleteMenuImportMapping } = await import('../menuImport');

    const renamed = await renameMenuImportMapping('map-2', 'Renamed Mapping');
    await deleteMenuImportMapping('map-2');

    expect(patchJSONMock).toHaveBeenCalledWith('/imports/mappings/map-2', {
      name: 'Renamed Mapping',
    });
    expect(delJSONMock).toHaveBeenCalledWith('/imports/mappings/map-2');
    expect(renamed.name).toBe('Renamed Mapping');
  });
});
