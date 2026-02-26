import { api, delJSON, getJSON, patchJSON, postJSON } from './http';

export type MenuImportPriceUnit = 'flat' | 'per_person' | 'per_unit';
export type MenuImportMappingDirection = 'inbound' | 'outbound';
export type MenuImportRuleType =
  | 'min_quantity'
  | 'max_quantity'
  | 'lead_time_hours'
  | 'order_multiple';

export interface MenuImportUploadResponse {
  import_session_id: string;
  column_names: string[];
  preview_rows: Array<Record<string, string>>;
  total_row_count: number;
}

export interface MenuImportRequiredMapping {
  name: string;
  price: string;
  item_name?: string;
  base_price?: string;
}

export interface MenuImportOptionalMapping {
  description?: string | null;
  category?: string | null;
  price_unit?: string | null;
  serving_description?: string | null;
  sku?: string | null;
  dietary_tags?: string | null;
  allergens?: string | null;
  sort_order?: string | null;
}

export interface MenuImportColumnGroupMapping {
  column: string;
  group_name: string;
}

export interface MenuImportModifierGroupBundleMapping {
  name_column: string;
  choices_column: string;
  pricing_column?: string | null;
  min_column?: string | null;
  max_column?: string | null;
  choice_delimiter?: string | null;
}

export interface MenuImportSoftRuleMapping {
  column: string;
  label: string;
}

export interface MenuImportExternalProviderMapping {
  column: string;
  provider_key: string;
  direction: MenuImportMappingDirection;
  external_field?: string | null;
  make_active?: boolean;
}

export interface MenuImportProviderCatalogEntry {
  provider_key: string;
  label: string;
  is_org_active: boolean;
  is_org_configured: boolean;
  supports_inbound: boolean;
  supports_outbound: boolean;
}

export interface MenuImportSavedMappingPayload {
  expected_columns: string[];
  field_mappings: Record<string, string>;
  price_unit_value_mappings?: Record<string, MenuImportPriceUnit>;
  modifier_group_bundles: Array<Record<string, unknown>>;
  remaining_decisions: Record<string, unknown>;
}

export interface MenuImportSavedMappingRecord {
  id: string;
  org_id: string;
  name: string;
  mapping: MenuImportSavedMappingPayload;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MenuImportMappingRequest {
  required: MenuImportRequiredMapping;
  optional?: MenuImportOptionalMapping;
  price_unit_value_mappings?: Record<string, MenuImportPriceUnit>;
  variants?: MenuImportColumnGroupMapping[];
  modifiers?: MenuImportColumnGroupMapping[];
  modifier_group_bundles?: MenuImportModifierGroupBundleMapping[];
  rule_mappings?: Partial<Record<MenuImportRuleType, string>>;
  soft_rule_mappings?: MenuImportSoftRuleMapping[];
  external_provider_mappings?: MenuImportExternalProviderMapping[];
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
  sku?: string;
  serving_description?: string;
  dietary_tags?: string;
  allergens?: string;
  sort_order?: number;
  variants?: Record<string, string>;
  modifiers?: Record<string, string>;
  modifier_groups?: MenuImportValidatedModifierGroup[];
  rules?: MenuImportValidatedRule[];
  soft_rules?: MenuImportValidatedSoftRule[];
  external_provider_mappings?: MenuImportValidatedExternalProviderMapping[];
  errors?: string[];
}

export interface MenuImportValidatedExternalProviderMapping {
  provider_key: string;
  provider_name?: string;
  direction: MenuImportMappingDirection;
  external_item_key: string;
  is_active?: boolean;
}

export interface MenuImportValidatedModifierOption {
  name: string;
  price_adjustment: number;
}

export interface MenuImportValidatedModifierGroup {
  name: string;
  min_selections: number;
  max_selections: number;
  options: MenuImportValidatedModifierOption[];
}

export interface MenuImportValidatedRule {
  rule_type: MenuImportRuleType;
  value: number;
}

export interface MenuImportValidatedSoftRule {
  label: string;
  content: string;
  is_customer_visible?: boolean;
  sort_order?: number;
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
  external_mappings_created?: number;
  external_mappings_updated?: number;
  external_mappings_conflicted?: number;
  error_count: number;
  errors: MenuImportCommitError[];
  modifier_groups_created?: number;
  modifier_groups_reused?: number;
  hard_rules_created?: number;
  soft_rules_created?: number;
  rows_skipped?: number;
  created_menu_id?: string;
  assigned_item_count?: number;
}

export interface MenuImportCommitRequest {
  create_menu?: {
    name: string;
    description?: string | null;
  };
}

export interface MenuImportSavedMappingsResponse {
  mappings: MenuImportSavedMappingRecord[];
}

export interface MenuImportProviderCatalogResponse {
  providers: MenuImportProviderCatalogEntry[];
}

export interface ListMenuImportProvidersOptions {
  org_id?: string | null;
  force_refresh?: boolean;
}

const providerCatalogCacheTTLMS = 10 * 60 * 1000;

type ProviderCatalogCacheEntry = {
  providers: MenuImportProviderCatalogEntry[];
  loaded_at_ms: number;
};

const providerCatalogCache = new Map<string, ProviderCatalogCacheEntry>();

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

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeProviderCatalogCacheKey(orgID?: string | null): string {
  const normalized = normalizeString(orgID);
  if (!normalized) {
    return '__default__';
  }
  return normalized;
}

function normalizeSavedMappingPayload(value: unknown): MenuImportSavedMappingPayload {
  const record = normalizeObject(value);

  const expectedColumns = Array.isArray(record['expected_columns'])
    ? record['expected_columns'].filter((entry): entry is string => typeof entry === 'string')
    : [];

  const fieldMappingsRaw = normalizeObject(record['field_mappings']);
  const fieldMappings: Record<string, string> = {};
  for (const [key, column] of Object.entries(fieldMappingsRaw)) {
    if (typeof column === 'string') {
      fieldMappings[key] = column;
    }
  }

  const priceUnitValueMappingsRaw = normalizeObject(record['price_unit_value_mappings']);
  const priceUnitValueMappings: Record<string, MenuImportPriceUnit> = {};
  for (const [rawValue, mappedValue] of Object.entries(priceUnitValueMappingsRaw)) {
    const normalizedRawValue = normalizeString(rawValue);
    if (!normalizedRawValue) {
      continue;
    }
    if (mappedValue === 'flat' || mappedValue === 'per_person' || mappedValue === 'per_unit') {
      priceUnitValueMappings[normalizedRawValue] = mappedValue;
    }
  }

  const modifierBundles = Array.isArray(record['modifier_group_bundles'])
    ? record['modifier_group_bundles']
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => normalizeObject(entry))
    : [];

  const remainingDecisionsRaw = normalizeObject(record['remaining_decisions']);
  const remainingDecisions: Record<string, unknown> = {};
  for (const [column, decision] of Object.entries(remainingDecisionsRaw)) {
    if (decision && typeof decision === 'object') {
      remainingDecisions[column] = decision;
    }
  }

  return {
    expected_columns: expectedColumns,
    field_mappings: fieldMappings,
    price_unit_value_mappings:
      Object.keys(priceUnitValueMappings).length > 0 ? priceUnitValueMappings : undefined,
    modifier_group_bundles: modifierBundles,
    remaining_decisions: remainingDecisions,
  };
}

function normalizeSavedMappingRecord(payload: unknown): MenuImportSavedMappingRecord {
  const record = normalizeObject(payload);
  return {
    id: normalizeString(record['id']),
    org_id: normalizeString(record['org_id']),
    name: normalizeString(record['name']),
    mapping: normalizeSavedMappingPayload(record['mapping']),
    created_by: normalizeString(record['created_by']),
    created_at: normalizeString(record['created_at']),
    updated_at: normalizeString(record['updated_at']),
  };
}

function normalizeSavedMappingsResponse(payload: unknown): MenuImportSavedMappingsResponse {
  const record = normalizeObject(payload);
  const mappingsRaw = Array.isArray(record['mappings']) ? record['mappings'] : [];
  return {
    mappings: mappingsRaw.map((entry) => normalizeSavedMappingRecord(entry)),
  };
}

function normalizeMappingDirection(value: unknown): MenuImportMappingDirection | '' {
  if (value === 'inbound' || value === 'outbound') {
    return value;
  }
  return '';
}

function normalizeProviderCatalogResponse(payload: unknown): MenuImportProviderCatalogResponse {
  const record = normalizeObject(payload);
  const providersRaw = Array.isArray(record['providers']) ? record['providers'] : [];
  return {
    providers: providersRaw
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const provider = normalizeObject(entry);
        return {
          provider_key: normalizeString(provider['provider_key']),
          label: normalizeString(provider['label']),
          is_org_active: provider['is_org_active'] === true,
          is_org_configured: provider['is_org_configured'] === true,
          supports_inbound: provider['supports_inbound'] === true,
          supports_outbound: provider['supports_outbound'] === true,
        };
      })
      .filter((entry) => entry.provider_key.length > 0),
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
        .map((entry) => {
          const row = normalizeObject(entry);
          const externalMappingsRaw = Array.isArray(row['external_provider_mappings'])
            ? row['external_provider_mappings']
            : [];

          const externalMappings = externalMappingsRaw
            .filter((mapping) => mapping && typeof mapping === 'object')
            .map((mapping) => {
              const normalized = normalizeObject(mapping);
              const direction = normalizeMappingDirection(normalized['direction']);
              if (!direction) {
                return null;
              }
              return {
                provider_key: normalizeString(normalized['provider_key']),
                provider_name: normalizeString(normalized['provider_name']) || undefined,
                direction,
                external_item_key: normalizeString(normalized['external_item_key']),
                is_active: normalized['is_active'] === true,
              };
            })
            .filter(
              (mapping): mapping is MenuImportValidatedExternalProviderMapping =>
                mapping !== null &&
                mapping.provider_key.length > 0 &&
                mapping.external_item_key.length > 0,
            );

          const normalizedRow = row as MenuImportValidatedPreviewRow;
          return {
            ...normalizedRow,
            external_provider_mappings: externalMappings.length > 0 ? externalMappings : undefined,
          };
        })
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
    external_mappings_created:
      typeof record['external_mappings_created'] === 'number' &&
      Number.isInteger(record['external_mappings_created'])
        ? Math.max(0, record['external_mappings_created'])
        : undefined,
    external_mappings_updated:
      typeof record['external_mappings_updated'] === 'number' &&
      Number.isInteger(record['external_mappings_updated'])
        ? Math.max(0, record['external_mappings_updated'])
        : undefined,
    external_mappings_conflicted:
      typeof record['external_mappings_conflicted'] === 'number' &&
      Number.isInteger(record['external_mappings_conflicted'])
        ? Math.max(0, record['external_mappings_conflicted'])
        : undefined,
    error_count:
      typeof record['error_count'] === 'number' && Number.isInteger(record['error_count'])
        ? Math.max(0, record['error_count'])
        : errors.length,
    errors,
    modifier_groups_created:
      typeof record['modifier_groups_created'] === 'number' &&
      Number.isInteger(record['modifier_groups_created'])
        ? Math.max(0, record['modifier_groups_created'])
        : undefined,
    modifier_groups_reused:
      typeof record['modifier_groups_reused'] === 'number' &&
      Number.isInteger(record['modifier_groups_reused'])
        ? Math.max(0, record['modifier_groups_reused'])
        : undefined,
    hard_rules_created:
      typeof record['hard_rules_created'] === 'number' &&
      Number.isInteger(record['hard_rules_created'])
        ? Math.max(0, record['hard_rules_created'])
        : undefined,
    soft_rules_created:
      typeof record['soft_rules_created'] === 'number' &&
      Number.isInteger(record['soft_rules_created'])
        ? Math.max(0, record['soft_rules_created'])
        : undefined,
    rows_skipped:
      typeof record['rows_skipped'] === 'number' && Number.isInteger(record['rows_skipped'])
        ? Math.max(0, record['rows_skipped'])
        : undefined,
    created_menu_id:
      typeof record['created_menu_id'] === 'string' && record['created_menu_id'].trim().length > 0
        ? record['created_menu_id'].trim()
        : undefined,
    assigned_item_count:
      typeof record['assigned_item_count'] === 'number' &&
      Number.isInteger(record['assigned_item_count'])
        ? Math.max(0, record['assigned_item_count'])
        : undefined,
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

export async function commitMenuImportCSV(
  sessionID: string,
  payload?: MenuImportCommitRequest,
): Promise<MenuImportCommitSummary> {
  const response = await postJSON<MenuImportCommitRequest | undefined, unknown>(
    `/imports/csv/${sessionID}/commit`,
    payload,
  );
  return normalizeCommitSummary(response);
}

export async function listMenuImportMappings(): Promise<MenuImportSavedMappingRecord[]> {
  const response = await getJSON<unknown>('/imports/mappings');
  return normalizeSavedMappingsResponse(response).mappings;
}

export function invalidateMenuImportProvidersCache(orgID?: string | null): void {
  if (typeof orgID === 'undefined') {
    providerCatalogCache.clear();
    return;
  }

  providerCatalogCache.delete(normalizeProviderCatalogCacheKey(orgID));
}

export async function listMenuImportProviders(
  options: ListMenuImportProvidersOptions = {},
): Promise<MenuImportProviderCatalogEntry[]> {
  const cacheKey = normalizeProviderCatalogCacheKey(options.org_id);
  const forceRefresh = options.force_refresh === true;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = providerCatalogCache.get(cacheKey);
    if (cached && now - cached.loaded_at_ms < providerCatalogCacheTTLMS) {
      return cached.providers;
    }
  }

  const response = await getJSON<unknown>('/imports/providers');
  const providers = normalizeProviderCatalogResponse(response).providers;
  providerCatalogCache.set(cacheKey, {
    providers,
    loaded_at_ms: Date.now(),
  });
  return providers;
}

export async function createMenuImportMapping(
  name: string,
  mapping: MenuImportSavedMappingPayload,
): Promise<MenuImportSavedMappingRecord> {
  const response = await postJSON<
    { name: string; mapping: MenuImportSavedMappingPayload },
    unknown
  >('/imports/mappings', {
    name,
    mapping,
  });
  const record = normalizeObject(response);
  return normalizeSavedMappingRecord(record['mapping']);
}

export async function renameMenuImportMapping(
  id: string,
  name: string,
): Promise<MenuImportSavedMappingRecord> {
  const response = await patchJSON<{ name: string }, unknown>(`/imports/mappings/${id}`, { name });
  const record = normalizeObject(response);
  return normalizeSavedMappingRecord(record['mapping']);
}

export async function deleteMenuImportMapping(id: string): Promise<void> {
  await delJSON<unknown>(`/imports/mappings/${id}`);
}
