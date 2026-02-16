import { api, postJSON } from './http';

export type MenuImportPriceUnit = 'flat' | 'per_person' | 'per_unit';

export interface MenuImportUploadResponse {
  import_session_id: string;
  column_names: string[];
  preview_rows: Array<Record<string, string>>;
  total_row_count: number;
}

export interface MenuImportRequiredMapping {
  name: string;
  price: string;
}

export interface MenuImportOptionalMapping {
  description?: string | null;
  category?: string | null;
  price_unit?: string | null;
}

export interface MenuImportColumnGroupMapping {
  column: string;
  group_name: string;
}

export interface MenuImportMappingRequest {
  required: MenuImportRequiredMapping;
  optional?: MenuImportOptionalMapping;
  variants?: MenuImportColumnGroupMapping[];
  modifiers?: MenuImportColumnGroupMapping[];
}

export interface MenuImportRowValidationError {
  row: number;
  errors: string[];
}

export interface MenuImportValidatedPreviewRow {
  row: number;
  name?: string;
  price?: number;
  price_unit?: MenuImportPriceUnit;
  description?: string;
  category?: string;
  variants?: Record<string, string>;
  modifiers?: Record<string, string>;
  errors?: string[];
}

export interface MenuImportModifierGroupResolution {
  group_name: string;
  exists: boolean;
}

export interface MenuImportMappedColumnPreview {
  field: string;
  column: string;
  sample_values: string[];
}

export interface MenuImportRemainingColumnPreview {
  column: string;
  sample_values: string[];
}

export interface MenuImportMappingValidationResult {
  row_errors: MenuImportRowValidationError[];
  validated_preview: MenuImportValidatedPreviewRow[];
  modifier_groups: MenuImportModifierGroupResolution[];
  mapped_columns: MenuImportMappedColumnPreview[];
  remaining_columns: MenuImportRemainingColumnPreview[];
}

export interface MenuImportCommitError {
  row?: number;
  message: string;
}

export interface MenuImportCommitSummary {
  created_count: number;
  updated_count: number;
  error_count: number;
  errors: MenuImportCommitError[];
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeUploadResponse(payload: unknown): MenuImportUploadResponse {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const previewRows = Array.isArray(record['preview_rows'])
    ? record['preview_rows']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => entry as Record<string, string>)
    : [];

  return {
    import_session_id: normalizeString(record['import_session_id']),
    column_names: normalizeStringList(record['column_names']),
    preview_rows: previewRows,
    total_row_count:
      typeof record['total_row_count'] === 'number' && Number.isInteger(record['total_row_count'])
        ? Math.max(0, record['total_row_count'])
        : 0,
  };
}

function normalizeMappingValidationResult(payload: unknown): MenuImportMappingValidationResult {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const rowErrors = Array.isArray(record['row_errors'])
    ? record['row_errors']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const rowError = entry as Record<string, unknown>;
          return {
            row:
              typeof rowError['row'] === 'number' && Number.isInteger(rowError['row'])
                ? rowError['row']
                : 0,
            errors: normalizeStringList(rowError['errors']),
          };
        })
    : [];

  const preview = Array.isArray(record['validated_preview'])
    ? record['validated_preview']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => entry as MenuImportValidatedPreviewRow)
    : [];

  const modifierGroups = Array.isArray(record['modifier_groups'])
    ? record['modifier_groups']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const group = entry as Record<string, unknown>;
          return {
            group_name: normalizeString(group['group_name']),
            exists: group['exists'] === true,
          };
        })
    : [];

  const mappedColumns = Array.isArray(record['mapped_columns'])
    ? record['mapped_columns']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const mapped = entry as Record<string, unknown>;
          return {
            field: normalizeString(mapped['field']),
            column: normalizeString(mapped['column']),
            sample_values: normalizeStringList(mapped['sample_values']),
          };
        })
    : [];

  const remainingColumns = Array.isArray(record['remaining_columns'])
    ? record['remaining_columns']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const remaining = entry as Record<string, unknown>;
          return {
            column: normalizeString(remaining['column']),
            sample_values: normalizeStringList(remaining['sample_values']),
          };
        })
    : [];

  return {
    row_errors: rowErrors,
    validated_preview: preview,
    modifier_groups: modifierGroups,
    mapped_columns: mappedColumns,
    remaining_columns: remainingColumns,
  };
}

function normalizeCommitSummary(payload: unknown): MenuImportCommitSummary {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const errors = Array.isArray(record['errors'])
    ? record['errors']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const error = entry as Record<string, unknown>;
          return {
            row:
              typeof error['row'] === 'number' && Number.isInteger(error['row'])
                ? error['row']
                : undefined,
            message: normalizeString(error['message']),
          };
        })
    : [];

  return {
    created_count:
      typeof record['created_count'] === 'number' && Number.isInteger(record['created_count'])
        ? Math.max(0, record['created_count'])
        : 0,
    updated_count:
      typeof record['updated_count'] === 'number' && Number.isInteger(record['updated_count'])
        ? Math.max(0, record['updated_count'])
        : 0,
    error_count:
      typeof record['error_count'] === 'number' && Number.isInteger(record['error_count'])
        ? Math.max(0, record['error_count'])
        : errors.length,
    errors,
  };
}

export async function uploadMenuImportCSV(file: File): Promise<MenuImportUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post<unknown>('/imports/csv/upload', form);
  return normalizeUploadResponse(response.data);
}

export async function mapMenuImportCSV(
  sessionID: string,
  payload: MenuImportMappingRequest,
): Promise<MenuImportMappingValidationResult> {
  const response = await postJSON<MenuImportMappingRequest, unknown>(
    `/imports/csv/${sessionID}/map`,
    payload,
  );
  return normalizeMappingValidationResult(response);
}

export async function commitMenuImportCSV(sessionID: string): Promise<MenuImportCommitSummary> {
  const response = await postJSON<undefined, unknown>(`/imports/csv/${sessionID}/commit`);
  return normalizeCommitSummary(response);
}
