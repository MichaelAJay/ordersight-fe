import { beforeEach, describe, expect, test, vi } from 'vitest';

const postJSONMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('../http', () => ({
  api: {
    post: (...args: unknown[]) => apiPostMock(...args),
  },
  postJSON: (...args: unknown[]) => postJSONMock(...args),
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
    });

    expect(postJSONMock).toHaveBeenCalledWith('/imports/csv/session-1/map', {
      required: { name: 'Item Name', price: 'Item Price' },
      optional: { description: 'Description' },
      modifiers: [{ column: 'Add-ons', group_name: 'Add-ons' }],
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

  test('commits CSV import with /imports/csv/:session/commit', async () => {
    postJSONMock.mockResolvedValue({
      created_count: 4,
      updated_count: 2,
      error_count: 0,
      errors: [],
    });

    const { commitMenuImportCSV } = await import('../menuImport');
    const result = await commitMenuImportCSV('session-1');

    expect(postJSONMock).toHaveBeenCalledWith('/imports/csv/session-1/commit');
    expect(result).toEqual({
      created_count: 4,
      updated_count: 2,
      error_count: 0,
      errors: [],
    });
  });
});
