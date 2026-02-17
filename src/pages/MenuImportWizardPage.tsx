import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropZone, FileTrigger, Text, isFileDropItem } from 'react-aria-components';
import { Button } from '@/components/common/Button/Button';
import { HttpError } from '@/services/http';
import {
  commitMenuImportCSV,
  createMenuImportMapping,
  deleteMenuImportMapping,
  listMenuImportMappings,
  mapMenuImportCSV,
  renameMenuImportMapping,
  uploadMenuImportCSV,
  type MenuImportCommitSummary,
  type MenuImportMappingRequest,
  type MenuImportMappingValidationResult,
  type MenuImportModifierGroupBundleMapping,
  type MenuImportPriceUnit,
  type MenuImportRuleType,
  type MenuImportSavedMappingPayload,
  type MenuImportSavedMappingRecord,
  type MenuImportUploadResponse,
} from '@/services/menuImport';
import styles from './MenuImportWizardPage.module.css';

type MappingKey =
  | 'item_name'
  | 'base_price'
  | 'description'
  | 'category'
  | 'price_unit'
  | 'serving_description'
  | 'sku'
  | 'dietary_tags'
  | 'allergens'
  | 'sort_order';

type WizardStep = 0 | 1 | 2 | 3 | 4;
type RemainingMode = 'unassigned' | 'hard_rule' | 'soft_rule' | 'skip';
type BundleSlotKey =
  | 'name_column'
  | 'choices_column'
  | 'pricing_column'
  | 'min_column'
  | 'max_column';

type ParsedCSVData = {
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
};

type ModifierBundleDraft = {
  id: string;
  name_column: string;
  choices_column: string;
  pricing_column: string;
  min_column: string;
  max_column: string;
  choice_delimiter: string;
  delimiterTouched: boolean;
};

type RemainingDecision = {
  mode: RemainingMode;
  ruleType: MenuImportRuleType | '';
  label: string;
  softLabelConfirmed: boolean;
};

type SavedImportMapping = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  expected_columns: string[];
  field_mappings: Record<MappingKey, string>;
  price_unit_value_mappings: Record<string, MenuImportPriceUnit>;
  modifier_group_bundles: ModifierBundleDraft[];
  remaining_decisions: Record<string, RemainingDecision>;
};

type DuplicateConflict = {
  kind: 'name' | 'sku';
  value: string;
  rows: number[];
};

type UploadRowEntry = {
  sourceRowNumber: number;
  row: Record<string, string>;
};

const STEP_LABELS = ['Upload', 'Field mapping', 'Column grouping', 'Preview', 'Results'];
const BUNDLE_SLOT_KEYS: BundleSlotKey[] = [
  'name_column',
  'choices_column',
  'pricing_column',
  'min_column',
  'max_column',
];
const RULE_TYPE_OPTIONS: Array<{ value: MenuImportRuleType; label: string; helper: string }> = [
  {
    value: 'min_quantity',
    label: 'Minimum quantity',
    helper: 'Integer >= 1',
  },
  {
    value: 'max_quantity',
    label: 'Maximum quantity',
    helper: 'Integer >= 1 and >= minimum when both exist',
  },
  {
    value: 'lead_time_hours',
    label: 'Lead time (hours)',
    helper: 'Integer >= 0',
  },
  {
    value: 'order_multiple',
    label: 'Order multiple',
    helper: 'Use 2 or greater. A value of 1 has no effect and is invalid.',
  },
];
const DELIMITER_OPTIONS = ['|', ';', '/'];
const PRICE_UNIT_OPTIONS: MenuImportPriceUnit[] = ['flat', 'per_person', 'per_unit'];

const REQUIRED_FIELDS: Array<{
  key: Extract<MappingKey, 'item_name' | 'base_price'>;
  label: string;
  helper: string;
  suggestions: string[];
}> = [
  {
    key: 'item_name',
    label: 'Item Name',
    helper: 'Required. This is the customer-facing menu item name.',
    suggestions: ['item', 'item name', 'name', 'product'],
  },
  {
    key: 'base_price',
    label: 'Base Price',
    helper: 'Required. Values like 12.50 or $12.50 are accepted.',
    suggestions: ['base price', 'price', 'cost', 'amount', 'item price'],
  },
];

const OPTIONAL_FIELDS: Array<{
  key: Exclude<MappingKey, 'item_name' | 'base_price'>;
  label: string;
  helper: string;
  suggestions: string[];
}> = [
  {
    key: 'description',
    label: 'Description',
    helper: 'Optional item description.',
    suggestions: ['description', 'details', 'item description'],
  },
  {
    key: 'category',
    label: 'Category / Section',
    helper: 'Optional. Used to group preview and imported items.',
    suggestions: ['category', 'section', 'menu section', 'group'],
  },
  {
    key: 'price_unit',
    label: 'Price Unit',
    helper: 'Optional. flat, per_person, or per_unit.',
    suggestions: ['price unit', 'pricing unit', 'unit', 'per person', 'per unit'],
  },
  {
    key: 'serving_description',
    label: 'Serving Size',
    helper: 'Optional serving description.',
    suggestions: ['serving', 'serving size', 'serves'],
  },
  {
    key: 'sku',
    label: 'SKU / Item Code',
    helper: 'Optional SKU or item code.',
    suggestions: ['sku', 'item code', 'code'],
  },
  {
    key: 'dietary_tags',
    label: 'Dietary Tags',
    helper: 'Optional dietary metadata.',
    suggestions: ['dietary', 'diet', 'tags'],
  },
  {
    key: 'allergens',
    label: 'Allergens',
    helper: 'Optional allergen metadata.',
    suggestions: ['allergen', 'allergens'],
  },
  {
    key: 'sort_order',
    label: 'Sort Order',
    helper: 'Optional ordering value.',
    suggestions: ['sort', 'sort order', 'display order', 'position', 'rank'],
  },
];

const EMPTY_FIELD_MAPPINGS: Record<MappingKey, string> = {
  item_name: '',
  base_price: '',
  description: '',
  category: '',
  price_unit: '',
  serving_description: '',
  sku: '',
  dietary_tags: '',
  allergens: '',
  sort_order: '',
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePriceUnitValue(value: string): string {
  return normalizeKey(value).replace(/[\s-]+/g, '_');
}

function normalizePriceUnitSourceValue(value: string): string {
  return normalizeKey(value);
}

function getDefaultPriceUnitMapping(value: string): MenuImportPriceUnit | '' {
  const normalized = normalizePriceUnitValue(value);
  if (normalized === 'flat' || normalized === 'per_person' || normalized === 'per_unit') {
    return normalized;
  }
  return '';
}

function resolvePriceUnitMapping(
  sourceValue: string,
  valueMappings: Record<string, MenuImportPriceUnit>,
): MenuImportPriceUnit | '' {
  const normalizedSourceValue = normalizePriceUnitSourceValue(sourceValue);
  const mapped = valueMappings[normalizedSourceValue];
  if (mapped) {
    return mapped;
  }
  return getDefaultPriceUnitMapping(sourceValue);
}

function normalizePriceUnitValueMappings(raw: unknown): Record<string, MenuImportPriceUnit> {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, MenuImportPriceUnit> = {};
  for (const [sourceValue, mappedValue] of Object.entries(source)) {
    const normalizedSourceValue = normalizePriceUnitSourceValue(sourceValue);
    if (!normalizedSourceValue) {
      continue;
    }
    if (mappedValue === 'flat' || mappedValue === 'per_person' || mappedValue === 'per_unit') {
      out[normalizedSourceValue] = mappedValue;
    }
  }
  return out;
}

function escapeCSVCell(value: string): string {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeCSV(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => escapeCSVCell(cell)).join(',')).join('\n');
}

function buildMappedUploadFile(
  file: File,
  headers: string[],
  rows: Array<Record<string, string>>,
  priceUnitColumn: string,
  priceUnitValueMappings: Record<string, MenuImportPriceUnit>,
): File {
  const mappedRows = priceUnitColumn.trim()
    ? rows.map((row) => {
        const sourceValue = row[priceUnitColumn] ?? '';
        const mappedValue = resolvePriceUnitMapping(sourceValue, priceUnitValueMappings);
        if (!mappedValue) {
          return row;
        }
        return {
          ...row,
          [priceUnitColumn]: mappedValue,
        };
      })
    : rows;

  const csvRows = [headers, ...mappedRows.map((row) => headers.map((header) => row[header] ?? ''))];
  const mappedCSV = serializeCSV(csvRows);

  return new File([mappedCSV], file.name, {
    type: file.type || 'text/csv',
    lastModified: file.lastModified,
  });
}

function isCSVFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  return (
    name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  const message = detailsMessage ?? httpError?.message ?? fallback;
  return message
    .replace(/^bad request:\s*/i, '')
    .replace(/:\s*bad request$/i, '')
    .trim();
}

function explainValidationIssue(issue: string): string {
  if (issue.includes('pricing token') && issue.includes('must be integer cents')) {
    return `${issue}. Use whole cents after ":" (example: "Extra Berries:75" for $0.75).`;
  }
  return issue;
}

function uniqueSampleValues(values: string[], limit = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const dedupeKey = normalizeKey(normalized);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    out.push(normalized);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

function parseCSVMatrix(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let idx = 0; idx < input.length; idx += 1) {
    const char = input[idx];

    if (inQuotes) {
      if (char === '"') {
        if (input[idx + 1] === '"') {
          cell += '"';
          idx += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseCSVContent(raw: string): ParsedCSVData {
  const withoutBOM = raw.replace(/^\uFEFF/, '');
  const matrix = parseCSVMatrix(withoutBOM);
  if (matrix.length === 0) {
    throw new Error('The CSV file is empty.');
  }

  const headers = matrix[0] ?? [];
  if (headers.length === 0 || headers.every((header) => !header.trim())) {
    throw new Error('The CSV file is missing headers.');
  }

  const rows: Array<Record<string, string>> = [];
  for (const sourceRow of matrix.slice(1)) {
    const row: Record<string, string> = {};
    let hasContent = false;
    for (let idx = 0; idx < headers.length; idx += 1) {
      const header = headers[idx];
      if (typeof header !== 'string') {
        continue;
      }
      const value = idx < sourceRow.length ? (sourceRow[idx] ?? '') : '';
      row[header] = value;
      if (!hasContent && value.trim().length > 0) {
        hasContent = true;
      }
    }
    if (hasContent) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error('The CSV file has headers but no data rows.');
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}

function autoMapHeaders(headers: string[]): Record<MappingKey, string> {
  const mapped: Record<MappingKey, string> = { ...EMPTY_FIELD_MAPPINGS };
  const used = new Set<string>();
  const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

  for (const field of allFields) {
    for (const header of headers) {
      if (used.has(header)) {
        continue;
      }

      const normalizedHeader = normalizeKey(header);
      if (
        !field.suggestions.some((suggestion) => normalizedHeader.includes(normalizeKey(suggestion)))
      ) {
        continue;
      }

      mapped[field.key] = header;
      used.add(header);
      break;
    }
  }

  return mapped;
}

function formatPrice(cents?: number, unit?: string): string {
  if (typeof cents !== 'number') {
    return 'Missing price';
  }

  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

  if (unit === 'per_person') {
    return `${amount} / person`;
  }
  if (unit === 'per_unit') {
    return `${amount} / unit`;
  }
  return amount;
}

function createBundleDraft(): ModifierBundleDraft {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `bundle-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name_column: '',
    choices_column: '',
    pricing_column: '',
    min_column: '',
    max_column: '',
    choice_delimiter: '|',
    delimiterTouched: false,
  };
}

function detectChoiceDelimiter(values: string[]): string {
  const scores = new Map<string, number>();
  for (const delimiter of DELIMITER_OPTIONS) {
    scores.set(delimiter, 0);
  }

  for (const value of values) {
    for (const delimiter of DELIMITER_OPTIONS) {
      const count = value.split(delimiter).length - 1;
      scores.set(delimiter, (scores.get(delimiter) ?? 0) + Math.max(0, count));
    }
  }

  let best = '|';
  let bestScore = -1;
  for (const delimiter of DELIMITER_OPTIONS) {
    const score = scores.get(delimiter) ?? 0;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }

  return best;
}

function getFileToken(file: File | null, fingerprint = ''): string {
  if (!file) {
    return '';
  }
  return `${file.name}:${file.size}:${file.lastModified}:${fingerprint}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function fromSavedMappingRecord(record: MenuImportSavedMappingRecord): SavedImportMapping {
  const mapping = record.mapping as MenuImportSavedMappingPayload;
  const modifierBundlesRaw = Array.isArray(mapping.modifier_group_bundles)
    ? mapping.modifier_group_bundles
    : [];

  const modifierBundles: ModifierBundleDraft[] = modifierBundlesRaw.map((bundle) => {
    const normalized: Record<string, unknown> = bundle && typeof bundle === 'object' ? bundle : {};
    return {
      id:
        typeof normalized['id'] === 'string' && normalized['id'].trim()
          ? normalized['id']
          : typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `bundle-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name_column: typeof normalized['name_column'] === 'string' ? normalized['name_column'] : '',
      choices_column:
        typeof normalized['choices_column'] === 'string' ? normalized['choices_column'] : '',
      pricing_column:
        typeof normalized['pricing_column'] === 'string' ? normalized['pricing_column'] : '',
      min_column: typeof normalized['min_column'] === 'string' ? normalized['min_column'] : '',
      max_column: typeof normalized['max_column'] === 'string' ? normalized['max_column'] : '',
      choice_delimiter:
        typeof normalized['choice_delimiter'] === 'string' && normalized['choice_delimiter']
          ? normalized['choice_delimiter']
          : '|',
      delimiterTouched:
        typeof normalized['delimiterTouched'] === 'boolean' ? normalized['delimiterTouched'] : true,
    };
  });

  const fieldMappingRaw = mapping.field_mappings ?? {};
  const fieldMappings: Record<MappingKey, string> = { ...EMPTY_FIELD_MAPPINGS };
  for (const key of Object.keys(fieldMappings) as MappingKey[]) {
    const value = fieldMappingRaw[key];
    if (typeof value === 'string') {
      fieldMappings[key] = value;
    }
  }

  const priceUnitValueMappings = normalizePriceUnitValueMappings(mapping.price_unit_value_mappings);

  const decisionsRaw = mapping.remaining_decisions ?? {};
  const decisions: Record<string, RemainingDecision> = {};
  for (const [column, raw] of Object.entries(decisionsRaw)) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const decision = raw as Record<string, unknown>;
    const mode = decision['mode'];
    if (mode !== 'unassigned' && mode !== 'hard_rule' && mode !== 'soft_rule' && mode !== 'skip') {
      continue;
    }
    const ruleTypeRaw = decision['ruleType'];
    const ruleType =
      ruleTypeRaw === 'min_quantity' ||
      ruleTypeRaw === 'max_quantity' ||
      ruleTypeRaw === 'lead_time_hours' ||
      ruleTypeRaw === 'order_multiple'
        ? ruleTypeRaw
        : '';
    decisions[column] = {
      mode,
      ruleType,
      label: typeof decision['label'] === 'string' ? decision['label'] : column,
      softLabelConfirmed:
        mode === 'soft_rule'
          ? typeof decision['softLabelConfirmed'] === 'boolean'
            ? decision['softLabelConfirmed']
            : true
          : true,
    };
  }

  return {
    id: record.id,
    name: record.name,
    created_at: record.created_at,
    updated_at: record.updated_at,
    expected_columns: Array.isArray(mapping.expected_columns) ? mapping.expected_columns : [],
    field_mappings: fieldMappings,
    price_unit_value_mappings: priceUnitValueMappings,
    modifier_group_bundles: modifierBundles,
    remaining_decisions: decisions,
  };
}

function toSavedMappingPayload(
  expectedColumns: string[],
  fieldMappings: Record<MappingKey, string>,
  priceUnitValueMappings: Record<string, MenuImportPriceUnit>,
  modifierBundles: ModifierBundleDraft[],
  remainingDecisions: Record<string, RemainingDecision>,
): MenuImportSavedMappingPayload {
  return {
    expected_columns: expectedColumns,
    field_mappings: fieldMappings,
    price_unit_value_mappings: priceUnitValueMappings,
    modifier_group_bundles: modifierBundles.map((bundle) => ({ ...bundle })),
    remaining_decisions: { ...remainingDecisions },
  };
}

function normalizeCommitSummary(raw: unknown): MenuImportCommitSummary | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const createdCount = record['created_count'];
  const updatedCount = record['updated_count'];
  const errorCount = record['error_count'];
  const errorsRaw = record['errors'];

  if (
    typeof createdCount !== 'number' ||
    typeof updatedCount !== 'number' ||
    typeof errorCount !== 'number' ||
    !Array.isArray(errorsRaw)
  ) {
    return null;
  }

  return {
    created_count: Math.max(0, createdCount),
    updated_count: Math.max(0, updatedCount),
    error_count: Math.max(0, errorCount),
    errors: errorsRaw
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const rowRecord = entry as Record<string, unknown>;
        return {
          row:
            typeof rowRecord['row'] === 'number' && Number.isInteger(rowRecord['row'])
              ? rowRecord['row']
              : undefined,
          message:
            typeof rowRecord['message'] === 'string' ? rowRecord['message'] : 'Unknown error',
        };
      }),
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
  };
}

export function MenuImportWizardPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<WizardStep>(0);
  const [maxStepReached, setMaxStepReached] = useState<WizardStep>(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsedCSV, setParsedCSV] = useState<ParsedCSVData | null>(null);

  const [serverUploadResult, setServerUploadResult] = useState<MenuImportUploadResponse | null>(
    null,
  );
  const [serverUploadFileToken, setServerUploadFileToken] = useState('');

  const [fieldMappings, setFieldMappings] = useState<Record<MappingKey, string>>({
    ...EMPTY_FIELD_MAPPINGS,
  });
  const [priceUnitValueMappings, setPriceUnitValueMappings] = useState<
    Record<string, MenuImportPriceUnit>
  >({});
  const [modifierBundles, setModifierBundles] = useState<ModifierBundleDraft[]>([]);
  const [remainingDecisions, setRemainingDecisions] = useState<Record<string, RemainingDecision>>(
    {},
  );

  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mappingResult, setMappingResult] = useState<MenuImportMappingValidationResult | null>(
    null,
  );

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<MenuImportCommitSummary | null>(null);
  const [rowKeepSelections, setRowKeepSelections] = useState<Record<number, boolean>>({});
  const [rowEdits, setRowEdits] = useState<Record<number, Record<string, string>>>({});
  const [previewDirty, setPreviewDirty] = useState(false);

  const [saveMappingName, setSaveMappingName] = useState('');
  const [saveMappingStatus, setSaveMappingStatus] = useState<string | null>(null);
  const [savedMappings, setSavedMappings] = useState<SavedImportMapping[]>([]);
  const [savedMappingsLoading, setSavedMappingsLoading] = useState(false);
  const [savedMappingsError, setSavedMappingsError] = useState<string | null>(null);
  const loadSavedMappings = useCallback(async () => {
    setSavedMappingsLoading(true);
    setSavedMappingsError(null);
    try {
      const records = await listMenuImportMappings();
      setSavedMappings(records.map((record) => fromSavedMappingRecord(record)));
    } catch (error) {
      setSavedMappingsError(getErrorMessage(error, 'Unable to load saved mappings.'));
    } finally {
      setSavedMappingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setSaveMappingName('');
      return;
    }
    setSaveMappingName(selectedFile.name.replace(/\.csv$/i, ''));
  }, [selectedFile]);

  useEffect(() => {
    void loadSavedMappings();
  }, [loadSavedMappings]);

  const previewRows = useMemo(() => parsedCSV?.rows.slice(0, 10) ?? [], [parsedCSV?.rows]);
  const rowsWithEdits = useMemo<UploadRowEntry[]>(() => {
    if (!parsedCSV) {
      return [];
    }
    return parsedCSV.rows.map((row, idx) => {
      const sourceRowNumber = idx + 1;
      const overrides = rowEdits[sourceRowNumber] ?? {};
      return {
        sourceRowNumber,
        row: {
          ...row,
          ...overrides,
        },
      };
    });
  }, [parsedCSV, rowEdits]);
  const rowsBySourceRowNumber = useMemo(() => {
    const out = new Map<number, Record<string, string>>();
    for (const entry of rowsWithEdits) {
      out.set(entry.sourceRowNumber, entry.row);
    }
    return out;
  }, [rowsWithEdits]);
  const uploadRowsWithSource = useMemo<UploadRowEntry[]>(
    () =>
      rowsWithEdits.filter((entry) => {
        return rowKeepSelections[entry.sourceRowNumber] ?? true;
      }),
    [rowKeepSelections, rowsWithEdits],
  );
  const editableRowsFingerprint = useMemo(() => JSON.stringify(rowEdits), [rowEdits]);
  const rowKeepFingerprint = useMemo(() => JSON.stringify(rowKeepSelections), [rowKeepSelections]);

  const allMappedHeaders = useMemo(
    () =>
      Object.values(fieldMappings)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [fieldMappings],
  );

  const requiredMissing = useMemo(
    () => REQUIRED_FIELDS.filter((field) => !fieldMappings[field.key].trim()),
    [fieldMappings],
  );

  const duplicateMappedHeaders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mapped of allMappedHeaders) {
      counts.set(mapped, (counts.get(mapped) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([header]) => header);
  }, [allMappedHeaders]);

  const priceUnitSourceValues = useMemo(() => {
    const priceUnitColumn = fieldMappings.price_unit.trim();
    if (!priceUnitColumn || !parsedCSV) {
      return [] as string[];
    }

    return uniqueSampleValues(
      parsedCSV.rows
        .map((row) => row[priceUnitColumn] ?? '')
        .filter((value) => value.trim().length > 0),
      Number.MAX_SAFE_INTEGER,
    );
  }, [fieldMappings.price_unit, parsedCSV]);

  const priceUnitValuesRequiringManualMapping = useMemo(
    () => priceUnitSourceValues.filter((sourceValue) => !getDefaultPriceUnitMapping(sourceValue)),
    [priceUnitSourceValues],
  );

  const resolvedPriceUnitValueMappings = useMemo(() => {
    const resolved: Record<string, MenuImportPriceUnit> = {};
    for (const sourceValue of priceUnitSourceValues) {
      const normalizedSourceValue = normalizePriceUnitSourceValue(sourceValue);
      const mappedValue = resolvePriceUnitMapping(sourceValue, priceUnitValueMappings);
      if (mappedValue) {
        resolved[normalizedSourceValue] = mappedValue;
      }
    }
    return resolved;
  }, [priceUnitSourceValues, priceUnitValueMappings]);

  const missingPriceUnitSourceValues = useMemo(() => {
    return priceUnitSourceValues.filter((sourceValue) => {
      const normalizedSourceValue = normalizePriceUnitSourceValue(sourceValue);
      return !resolvedPriceUnitValueMappings[normalizedSourceValue];
    });
  }, [priceUnitSourceValues, resolvedPriceUnitValueMappings]);

  const hasIncompletePriceUnitMappings =
    fieldMappings.price_unit.trim().length > 0 && missingPriceUnitSourceValues.length > 0;

  const showPriceUnitValueMappingSection =
    fieldMappings.price_unit.trim().length > 0 && priceUnitValuesRequiringManualMapping.length > 0;

  const priceUnitMappingFingerprint = useMemo(() => {
    const column = fieldMappings.price_unit.trim();
    if (!column) {
      return '';
    }
    const entries = Object.entries(resolvedPriceUnitValueMappings).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    if (entries.length === 0) {
      return column;
    }
    const serialized = entries.map(([source, mapped]) => `${source}=${mapped}`).join('|');
    return `${column}:${serialized}`;
  }, [fieldMappings.price_unit, resolvedPriceUnitValueMappings]);

  const unmappedColumnsAfterFields = useMemo(() => {
    const used = new Set(allMappedHeaders);
    return (parsedCSV?.headers ?? []).filter((header) => !used.has(header));
  }, [allMappedHeaders, parsedCSV?.headers]);

  const bundleUsedColumns = useMemo(() => {
    const out = new Set<string>();
    for (const bundle of modifierBundles) {
      for (const slot of BUNDLE_SLOT_KEYS) {
        const value = bundle[slot].trim();
        if (value) {
          out.add(value);
        }
      }
    }
    return out;
  }, [modifierBundles]);

  const columnsAvailableForDecision = useMemo(() => {
    return unmappedColumnsAfterFields.filter((column) => !bundleUsedColumns.has(column));
  }, [bundleUsedColumns, unmappedColumnsAfterFields]);

  const configuredBundles = useMemo(() => {
    return modifierBundles.filter((bundle) =>
      BUNDLE_SLOT_KEYS.some((slot) => bundle[slot].trim().length > 0),
    );
  }, [modifierBundles]);

  const incompleteBundleIDs = useMemo(() => {
    const out = new Set<string>();
    for (const bundle of configuredBundles) {
      if (!bundle.name_column.trim() || !bundle.choices_column.trim()) {
        out.add(bundle.id);
      }
    }
    return out;
  }, [configuredBundles]);

  const pendingDecisionColumns = useMemo(
    () =>
      columnsAvailableForDecision.filter((column) => {
        const decision = remainingDecisions[column] ?? {
          mode: 'unassigned' as RemainingMode,
          ruleType: '',
          label: column,
          softLabelConfirmed: false,
        };
        return (
          decision.mode === 'unassigned' ||
          (decision.mode === 'hard_rule' && !decision.ruleType) ||
          (decision.mode === 'soft_rule' && !decision.softLabelConfirmed)
        );
      }),
    [columnsAvailableForDecision, remainingDecisions],
  );
  const addressedDecisionColumns = useMemo(
    () =>
      columnsAvailableForDecision.filter((column) => {
        const decision = remainingDecisions[column] ?? {
          mode: 'unassigned' as RemainingMode,
          ruleType: '',
          label: column,
          softLabelConfirmed: false,
        };
        return (
          decision.mode === 'skip' ||
          (decision.mode === 'soft_rule' && decision.softLabelConfirmed) ||
          (decision.mode === 'hard_rule' && !!decision.ruleType)
        );
      }),
    [columnsAvailableForDecision, remainingDecisions],
  );
  const addressedDecisionColumnSet = useMemo(
    () => new Set(addressedDecisionColumns),
    [addressedDecisionColumns],
  );
  const bundleDropdownAvailableColumns = useMemo(
    () => unmappedColumnsAfterFields.filter((column) => !addressedDecisionColumnSet.has(column)),
    [addressedDecisionColumnSet, unmappedColumnsAfterFields],
  );
  const bundleDropdownAddressedColumns = useMemo(
    () => unmappedColumnsAfterFields.filter((column) => addressedDecisionColumnSet.has(column)),
    [addressedDecisionColumnSet, unmappedColumnsAfterFields],
  );

  const missingRuleTypeColumns = useMemo(
    () =>
      columnsAvailableForDecision.filter((column) => {
        const decision = remainingDecisions[column];
        return decision?.mode === 'hard_rule' && !decision.ruleType;
      }),
    [columnsAvailableForDecision, remainingDecisions],
  );

  const duplicateRuleTypes = useMemo(() => {
    const counts = new Map<MenuImportRuleType, number>();
    for (const column of columnsAvailableForDecision) {
      const decision = remainingDecisions[column];
      if (!decision || decision.mode !== 'hard_rule' || !decision.ruleType) {
        continue;
      }
      counts.set(decision.ruleType, (counts.get(decision.ruleType) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([ruleType]) => ruleType);
  }, [columnsAvailableForDecision, remainingDecisions]);

  const rowErrorsByRow = useMemo(() => {
    const out = new Map<number, string[]>();
    for (const rowError of mappingResult?.row_errors ?? []) {
      out.set(rowError.row, rowError.errors);
    }
    return out;
  }, [mappingResult?.row_errors]);

  const validPreviewRowsCount = useMemo(() => {
    if (!mappingResult) {
      return 0;
    }
    const invalidRows = new Set(mappingResult.row_errors.map((rowError) => rowError.row));
    return mappingResult.validated_preview.filter((row) => !invalidRows.has(row.row)).length;
  }, [mappingResult]);

  const hasBlockingValidationErrors = (mappingResult?.row_errors.length ?? 0) > 0;

  const duplicateConflicts = useMemo(() => {
    const conflicts: DuplicateConflict[] = [];
    const rows = rowsWithEdits.map((entry) => entry.row);

    const addConflicts = (kind: 'name' | 'sku', column: string) => {
      if (!column.trim()) {
        return;
      }
      const grouped = new Map<string, { rows: number[]; sample: string }>();
      for (let idx = 0; idx < rows.length; idx += 1) {
        const value = (rows[idx]?.[column] ?? '').trim();
        if (!value) {
          continue;
        }
        const key = normalizeKey(value);
        const bucket = grouped.get(key) ?? { rows: [], sample: value };
        bucket.rows.push(idx + 1);
        grouped.set(key, bucket);
      }
      for (const [, groupedValue] of grouped.entries()) {
        if (groupedValue.rows.length <= 1) {
          continue;
        }
        conflicts.push({
          kind,
          value: groupedValue.sample,
          rows: groupedValue.rows,
        });
      }
    };

    addConflicts('name', fieldMappings.item_name);
    addConflicts('sku', fieldMappings.sku);

    return conflicts;
  }, [fieldMappings.item_name, fieldMappings.sku, rowsWithEdits]);
  const unresolvedDuplicateConflicts = useMemo(
    () =>
      duplicateConflicts.filter(
        (conflict) =>
          conflict.rows.filter((rowNumber) => rowKeepSelections[rowNumber] ?? true).length > 1,
      ),
    [duplicateConflicts, rowKeepSelections],
  );
  const hasUnresolvedDuplicateConflicts = unresolvedDuplicateConflicts.length > 0;
  const canCommit =
    mappingResult !== null &&
    !validating &&
    !committing &&
    !previewDirty &&
    !hasBlockingValidationErrors &&
    !hasUnresolvedDuplicateConflicts &&
    uploadRowsWithSource.length > 0 &&
    validPreviewRowsCount > 0;
  const rowErrorFixEntries = useMemo(() => {
    if (!mappingResult) {
      return [] as Array<{
        previewRowNumber: number;
        sourceRowNumber: number;
        row: Record<string, string>;
        errors: string[];
      }>;
    }
    return mappingResult.row_errors
      .map((rowError) => {
        const uploadEntry = uploadRowsWithSource[rowError.row - 1];
        if (!uploadEntry) {
          return null;
        }
        return {
          previewRowNumber: rowError.row,
          sourceRowNumber: uploadEntry.sourceRowNumber,
          row: uploadEntry.row,
          errors: rowError.errors,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          previewRowNumber: number;
          sourceRowNumber: number;
          row: Record<string, string>;
          errors: string[];
        } => entry !== null,
      );
  }, [mappingResult, uploadRowsWithSource]);

  const groupedPreview = useMemo(() => {
    type PreviewRow = MenuImportMappingValidationResult['validated_preview'][number];
    const groups = new Map<string, PreviewRow[]>();
    for (const row of mappingResult?.validated_preview ?? []) {
      const category = row.category?.trim() || 'Uncategorized';
      const existing = groups.get(category) ?? [];
      existing.push(row);
      groups.set(category, existing);
    }
    return Array.from(groups.entries());
  }, [mappingResult]);

  const step3Ready =
    pendingDecisionColumns.length === 0 &&
    missingRuleTypeColumns.length === 0 &&
    duplicateRuleTypes.length === 0 &&
    incompleteBundleIDs.size === 0;

  const isHeaderUsedByOtherField = (column: string, field: MappingKey): boolean =>
    Object.entries(fieldMappings).some(([key, mapped]) => key !== field && mapped === column);

  const getMappedFieldSamples = (field: MappingKey): string[] => {
    if (!parsedCSV) {
      return [];
    }
    const column = fieldMappings[field];
    if (!column) {
      return [];
    }
    return uniqueSampleValues(
      parsedCSV.rows.map((row) => row[column] ?? ''),
      3,
    );
  };

  const getColumnSamples = (column: string, limit = 3): string[] => {
    if (!parsedCSV) {
      return [];
    }
    return uniqueSampleValues(
      parsedCSV.rows.map((row) => row[column] ?? ''),
      limit,
    );
  };

  const getDecision = (column: string): RemainingDecision => {
    return (
      remainingDecisions[column] ?? {
        mode: 'unassigned',
        ruleType: '',
        label: column,
        softLabelConfirmed: false,
      }
    );
  };

  const invalidateValidation = () => {
    setValidationError(null);
    setMappingResult(null);
    setCommitError(null);
    setCommitSummary(null);
    setPreviewDirty(false);
  };
  const markPreviewStale = () => {
    setValidationError('Changes detected. Click "Refresh preview" to revalidate.');
    setCommitError(null);
    setCommitSummary(null);
    setPreviewDirty(true);
  };

  const setFieldMapping = (key: MappingKey, column: string) => {
    setFieldMappings((previous) => ({ ...previous, [key]: column }));
    if (key === 'price_unit') {
      setPriceUnitValueMappings({});
    }
    invalidateValidation();
  };

  const isSourceRowKept = (sourceRowNumber: number): boolean => {
    return rowKeepSelections[sourceRowNumber] ?? true;
  };

  const setSourceRowKept = (sourceRowNumber: number, keep: boolean) => {
    setRowKeepSelections((previous) => {
      const next = { ...previous };
      if (keep) {
        delete next[sourceRowNumber];
      } else {
        next[sourceRowNumber] = false;
      }
      return next;
    });
    markPreviewStale();
  };

  const setSourceRowCellValue = (sourceRowNumber: number, column: string, value: string) => {
    if (!parsedCSV) {
      return;
    }

    const original = parsedCSV.rows[sourceRowNumber - 1]?.[column] ?? '';
    setRowEdits((previous) => {
      const next = { ...previous };
      const rowOverrides = { ...(next[sourceRowNumber] ?? {}) };
      if (value === original) {
        delete rowOverrides[column];
      } else {
        rowOverrides[column] = value;
      }

      if (Object.keys(rowOverrides).length === 0) {
        delete next[sourceRowNumber];
      } else {
        next[sourceRowNumber] = rowOverrides;
      }
      return next;
    });
    markPreviewStale();
  };

  const setPriceUnitSourceMapping = (
    sourceValue: string,
    mappedValue: MenuImportPriceUnit | '',
  ) => {
    const normalizedSourceValue = normalizePriceUnitSourceValue(sourceValue);
    setPriceUnitValueMappings((previous) => {
      const next = { ...previous };
      if (mappedValue) {
        next[normalizedSourceValue] = mappedValue;
      } else {
        delete next[normalizedSourceValue];
      }
      return next;
    });
    invalidateValidation();
  };

  const clearColumnFromBundles = (
    column: string,
    keepBundleID?: string,
    keepSlot?: BundleSlotKey,
  ) => {
    if (!column) {
      return;
    }
    setModifierBundles((previous) =>
      previous.map((bundle) => {
        let changed = false;
        const next = { ...bundle };
        for (const slot of BUNDLE_SLOT_KEYS) {
          if (bundle.id === keepBundleID && slot === keepSlot) {
            continue;
          }
          if (next[slot] === column) {
            next[slot] = '';
            changed = true;
          }
        }
        return changed ? next : bundle;
      }),
    );
  };

  const clearColumnDecision = (column: string) => {
    setRemainingDecisions((previous) => {
      const current = previous[column];
      if (!current || current.mode === 'unassigned') {
        return previous;
      }
      return {
        ...previous,
        [column]: {
          mode: 'unassigned',
          ruleType: '',
          label: current.label || column,
          softLabelConfirmed: false,
        },
      };
    });
  };

  const updateBundleSlot = (bundleID: string, slot: BundleSlotKey, column: string) => {
    if (column) {
      clearColumnFromBundles(column, bundleID, slot);
      clearColumnDecision(column);
    }

    setModifierBundles((previous) =>
      previous.map((bundle) => {
        if (bundle.id !== bundleID) {
          return bundle;
        }

        const next: ModifierBundleDraft = {
          ...bundle,
          [slot]: column,
        };

        if (
          (slot === 'choices_column' || slot === 'pricing_column') &&
          column &&
          !bundle.delimiterTouched
        ) {
          const values = getColumnSamples(column, 8);
          if (values.length > 0) {
            next.choice_delimiter = detectChoiceDelimiter(values);
          }
        }

        return next;
      }),
    );

    invalidateValidation();
  };

  const addModifierBundle = () => {
    setModifierBundles((previous) => [...previous, createBundleDraft()]);
    invalidateValidation();
  };

  const removeModifierBundle = (bundleID: string) => {
    setModifierBundles((previous) => previous.filter((bundle) => bundle.id !== bundleID));
    invalidateValidation();
  };

  const updateBundleDelimiter = (bundleID: string, delimiter: string) => {
    setModifierBundles((previous) =>
      previous.map((bundle) =>
        bundle.id === bundleID
          ? { ...bundle, choice_delimiter: delimiter, delimiterTouched: true }
          : bundle,
      ),
    );
    invalidateValidation();
  };

  const setDecisionMode = (column: string, mode: RemainingMode) => {
    if (mode !== 'unassigned') {
      clearColumnFromBundles(column);
    }

    setRemainingDecisions((previous) => {
      const current = previous[column] ?? {
        mode: 'unassigned' as RemainingMode,
        ruleType: '',
        label: column,
        softLabelConfirmed: false,
      };

      const next: RemainingDecision = {
        mode,
        ruleType: mode === 'hard_rule' ? current.ruleType : '',
        label: current.label || column,
        softLabelConfirmed:
          mode === 'soft_rule'
            ? current.mode === 'soft_rule'
              ? current.softLabelConfirmed
              : false
            : true,
      };

      return {
        ...previous,
        [column]: next,
      };
    });

    invalidateValidation();
  };

  const setDecisionRuleType = (column: string, ruleType: MenuImportRuleType | '') => {
    setRemainingDecisions((previous) => {
      const current = previous[column] ?? {
        mode: 'hard_rule' as RemainingMode,
        ruleType: '',
        label: column,
        softLabelConfirmed: false,
      };
      return {
        ...previous,
        [column]: {
          ...current,
          mode: 'hard_rule',
          ruleType,
          label: current.label || column,
          softLabelConfirmed: true,
        },
      };
    });
    invalidateValidation();
  };

  const setDecisionLabel = (column: string, label: string) => {
    setRemainingDecisions((previous) => {
      const current = previous[column] ?? {
        mode: 'soft_rule' as RemainingMode,
        ruleType: '',
        label: column,
        softLabelConfirmed: false,
      };
      return {
        ...previous,
        [column]: {
          ...current,
          mode: 'soft_rule',
          ruleType: '',
          label,
          softLabelConfirmed: current.softLabelConfirmed,
        },
      };
    });
    invalidateValidation();
  };

  const confirmSoftRuleDecision = (column: string) => {
    setRemainingDecisions((previous) => {
      const current = previous[column] ?? {
        mode: 'soft_rule' as RemainingMode,
        ruleType: '',
        label: column,
        softLabelConfirmed: false,
      };
      return {
        ...previous,
        [column]: {
          ...current,
          mode: 'soft_rule',
          ruleType: '',
          label: current.label.trim() || column,
          softLabelConfirmed: true,
        },
      };
    });
    invalidateValidation();
  };

  const setAllDecisionModesToSkip = () => {
    setRemainingDecisions((previous) => {
      const next: Record<string, RemainingDecision> = { ...previous };
      for (const column of columnsAvailableForDecision) {
        next[column] = {
          mode: 'skip',
          ruleType: '',
          label: previous[column]?.label || column,
          softLabelConfirmed: true,
        };
      }
      return next;
    });
    invalidateValidation();
  };

  const buildMappingPayload = (): MenuImportMappingRequest | null => {
    const itemNameColumn = fieldMappings.item_name.trim();
    const basePriceColumn = fieldMappings.base_price.trim();
    if (!itemNameColumn || !basePriceColumn) {
      return null;
    }

    const optional: MenuImportMappingRequest['optional'] = {};
    for (const optionalField of OPTIONAL_FIELDS) {
      const selectedColumn = fieldMappings[optionalField.key].trim();
      if (!selectedColumn) {
        continue;
      }
      optional[optionalField.key] = selectedColumn;
    }

    const modifierGroupBundles: MenuImportModifierGroupBundleMapping[] = [];
    for (const bundle of configuredBundles) {
      const nameColumn = bundle.name_column.trim();
      const choicesColumn = bundle.choices_column.trim();
      if (!nameColumn || !choicesColumn) {
        continue;
      }
      modifierGroupBundles.push({
        name_column: nameColumn,
        choices_column: choicesColumn,
        pricing_column: bundle.pricing_column.trim() || undefined,
        min_column: bundle.min_column.trim() || undefined,
        max_column: bundle.max_column.trim() || undefined,
        choice_delimiter: bundle.choice_delimiter || '|',
      });
    }

    const ruleMappings: Partial<Record<MenuImportRuleType, string>> = {};
    const softRuleMappings: Array<{ column: string; label: string }> = [];

    for (const column of columnsAvailableForDecision) {
      const decision = getDecision(column);
      if (decision.mode === 'hard_rule' && decision.ruleType) {
        ruleMappings[decision.ruleType] = column;
      }
      if (decision.mode === 'soft_rule') {
        softRuleMappings.push({
          column,
          label: decision.label.trim() || column,
        });
      }
    }

    const priceUnitValueMappingsForPayload: Record<string, MenuImportPriceUnit> = {};
    for (const sourceValue of priceUnitSourceValues) {
      const normalizedSourceValue = normalizePriceUnitSourceValue(sourceValue);
      const mappedValue = resolvedPriceUnitValueMappings[normalizedSourceValue];
      if (mappedValue) {
        priceUnitValueMappingsForPayload[normalizedSourceValue] = mappedValue;
      }
    }

    return {
      required: {
        name: itemNameColumn,
        price: basePriceColumn,
        item_name: itemNameColumn,
        base_price: basePriceColumn,
      },
      optional: Object.keys(optional).length > 0 ? optional : undefined,
      price_unit_value_mappings:
        optional.price_unit && Object.keys(priceUnitValueMappingsForPayload).length > 0
          ? priceUnitValueMappingsForPayload
          : undefined,
      modifier_group_bundles: modifierGroupBundles.length > 0 ? modifierGroupBundles : undefined,
      rule_mappings: Object.keys(ruleMappings).length > 0 ? ruleMappings : undefined,
      soft_rule_mappings: softRuleMappings.length > 0 ? softRuleMappings : undefined,
    };
  };

  const ensureServerUpload = async (): Promise<MenuImportUploadResponse | null> => {
    if (!selectedFile || !parsedCSV) {
      return null;
    }

    const token = getFileToken(
      selectedFile,
      `${priceUnitMappingFingerprint}:${editableRowsFingerprint}:${rowKeepFingerprint}`,
    );
    if (serverUploadResult && serverUploadFileToken === token) {
      return serverUploadResult;
    }

    const mappedUploadFile = buildMappedUploadFile(
      selectedFile,
      parsedCSV.headers,
      uploadRowsWithSource.map((entry) => entry.row),
      fieldMappings.price_unit.trim(),
      resolvedPriceUnitValueMappings,
    );
    const result = await uploadMenuImportCSV(mappedUploadFile);
    setServerUploadResult(result);
    setServerUploadFileToken(token);
    return result;
  };

  const runValidation = async (advanceToPreview: boolean) => {
    const payload = buildMappingPayload();
    if (!payload) {
      setValidationError('Map Item Name and Base Price before continuing.');
      return;
    }

    if (uploadRowsWithSource.length === 0) {
      setValidationError('Select at least one row to keep before validating.');
      return;
    }

    if (hasIncompletePriceUnitMappings) {
      setValidationError('Map every unique value in the Price Unit column before continuing.');
      return;
    }

    if (!step3Ready) {
      setValidationError('Finish all column-grouping actions before validation.');
      return;
    }

    setValidating(true);
    setValidationError(null);
    setCommitError(null);
    setCommitSummary(null);

    try {
      const uploadResult = await ensureServerUpload();
      if (!uploadResult?.import_session_id) {
        setValidationError('Unable to create an import session for validation.');
        return;
      }

      const result = await mapMenuImportCSV(uploadResult.import_session_id, payload);
      setMappingResult(result);
      setPreviewDirty(false);
      if (advanceToPreview) {
        setStep(3);
        setMaxStepReached((current) => (current > 3 ? current : 3));
      }
    } catch (error) {
      setValidationError(getErrorMessage(error, 'Unable to validate your import mapping.'));
    } finally {
      setValidating(false);
    }
  };

  const applySavedMapping = async (mapping: SavedImportMapping) => {
    if (!parsedCSV) {
      return;
    }

    const headers = new Set(parsedCSV.headers);
    const storedFieldMappings: Record<MappingKey, string> =
      mapping.field_mappings && typeof mapping.field_mappings === 'object'
        ? (mapping.field_mappings as Record<MappingKey, string>)
        : EMPTY_FIELD_MAPPINGS;
    const storedDecisions: Record<string, RemainingDecision> =
      mapping.remaining_decisions && typeof mapping.remaining_decisions === 'object'
        ? (mapping.remaining_decisions as Record<string, RemainingDecision>)
        : {};

    const appliedFields: Record<MappingKey, string> = { ...EMPTY_FIELD_MAPPINGS };
    for (const key of Object.keys(EMPTY_FIELD_MAPPINGS) as MappingKey[]) {
      const value = storedFieldMappings[key];
      if (value && headers.has(value)) {
        appliedFields[key] = value;
      }
    }

    const usedByFields = new Set(
      Object.values(appliedFields)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
    const remainingColumns = parsedCSV.headers.filter((header) => !usedByFields.has(header));
    const remainingSet = new Set(remainingColumns);

    const storedBundles = Array.isArray(mapping.modifier_group_bundles)
      ? mapping.modifier_group_bundles
      : [];
    const nextBundles = storedBundles.map((bundle) => ({
      ...bundle,
      name_column: remainingSet.has(bundle.name_column) ? bundle.name_column : '',
      choices_column: remainingSet.has(bundle.choices_column) ? bundle.choices_column : '',
      pricing_column: remainingSet.has(bundle.pricing_column) ? bundle.pricing_column : '',
      min_column: remainingSet.has(bundle.min_column) ? bundle.min_column : '',
      max_column: remainingSet.has(bundle.max_column) ? bundle.max_column : '',
      choice_delimiter: bundle.choice_delimiter || '|',
    }));

    const columnsUsedByBundles = new Set<string>();
    for (const bundle of nextBundles) {
      for (const slot of BUNDLE_SLOT_KEYS) {
        const value = bundle[slot].trim();
        if (value) {
          columnsUsedByBundles.add(value);
        }
      }
    }

    const nextDecisions: Record<string, RemainingDecision> = {};
    for (const column of remainingColumns) {
      if (columnsUsedByBundles.has(column)) {
        continue;
      }
      const decision = storedDecisions[column];
      if (!decision) {
        nextDecisions[column] = {
          mode: 'unassigned',
          ruleType: '',
          label: column,
          softLabelConfirmed: false,
        };
        continue;
      }
      if (decision.mode === 'hard_rule') {
        nextDecisions[column] = {
          mode: 'hard_rule',
          ruleType: decision.ruleType,
          label: decision.label || column,
          softLabelConfirmed: true,
        };
        continue;
      }
      if (decision.mode === 'soft_rule') {
        nextDecisions[column] = {
          mode: 'soft_rule',
          ruleType: '',
          label: decision.label || column,
          softLabelConfirmed: decision.softLabelConfirmed,
        };
        continue;
      }
      if (decision.mode === 'skip') {
        nextDecisions[column] = {
          mode: 'skip',
          ruleType: '',
          label: decision.label || column,
          softLabelConfirmed: true,
        };
        continue;
      }
      nextDecisions[column] = {
        mode: 'unassigned',
        ruleType: '',
        label: column,
        softLabelConfirmed: false,
      };
    }

    setFieldMappings(appliedFields);
    setPriceUnitValueMappings(
      appliedFields.price_unit.trim().length > 0
        ? normalizePriceUnitValueMappings(mapping.price_unit_value_mappings)
        : {},
    );
    setModifierBundles(nextBundles);
    setRemainingDecisions(nextDecisions);
    setRowKeepSelections({});
    setRowEdits({});
    invalidateValidation();

    const expectedColumns = Array.isArray(mapping.expected_columns) ? mapping.expected_columns : [];
    const missingColumns = expectedColumns.filter((column) => !headers.has(column));
    if (missingColumns.length > 0) {
      setUploadError(
        `Saved mapping "${mapping.name}" partially matched. Missing columns: ${missingColumns.join(', ')}.`,
      );
      setStep(1);
      setMaxStepReached((current) => (current > 1 ? current : 1));
      return;
    }

    setUploadError(null);
    setStep(2);
    setMaxStepReached((current) => (current > 2 ? current : 2));

    window.setTimeout(() => {
      void runValidation(true);
    }, 0);
  };

  const handleSaveCurrentMapping = async () => {
    if (!parsedCSV) {
      return;
    }

    const mappingName = saveMappingName.trim();
    if (!mappingName) {
      setSaveMappingStatus('Enter a mapping name before saving.');
      return;
    }

    const expectedColumns = new Set<string>();
    for (const value of Object.values(fieldMappings)) {
      const normalized = value.trim();
      if (normalized) {
        expectedColumns.add(normalized);
      }
    }
    for (const bundle of configuredBundles) {
      for (const slot of BUNDLE_SLOT_KEYS) {
        const value = bundle[slot].trim();
        if (value) {
          expectedColumns.add(value);
        }
      }
    }
    for (const column of columnsAvailableForDecision) {
      const decision = getDecision(column);
      if (decision.mode === 'hard_rule' || decision.mode === 'soft_rule') {
        expectedColumns.add(column);
      }
    }

    const payload = toSavedMappingPayload(
      Array.from(expectedColumns.values()),
      { ...fieldMappings },
      { ...resolvedPriceUnitValueMappings },
      modifierBundles.map((bundle) => ({ ...bundle })),
      { ...remainingDecisions },
    );

    try {
      await createMenuImportMapping(mappingName, payload);
      await loadSavedMappings();
      setSaveMappingStatus(`Saved mapping "${mappingName}".`);
    } catch (error) {
      setSaveMappingStatus(getErrorMessage(error, 'Unable to save mapping.'));
    }
  };

  const renameSavedMapping = async (mappingID: string) => {
    const target = savedMappings.find((mapping) => mapping.id === mappingID);
    if (!target || typeof window === 'undefined') {
      return;
    }

    const nextName = window.prompt('Rename mapping', target.name);
    if (!nextName || !nextName.trim()) {
      return;
    }

    try {
      await renameMenuImportMapping(mappingID, nextName.trim());
      await loadSavedMappings();
    } catch (error) {
      setSavedMappingsError(getErrorMessage(error, 'Unable to rename mapping.'));
    }
  };

  const deleteSavedMapping = async (mappingID: string) => {
    try {
      await deleteMenuImportMapping(mappingID);
      await loadSavedMappings();
    } catch (error) {
      setSavedMappingsError(getErrorMessage(error, 'Unable to delete mapping.'));
    }
  };

  const advanceStep = (target: WizardStep) => {
    setStep(target);
    setMaxStepReached((current) => (current > target ? current : target));
  };

  const resetWizard = () => {
    setStep(0);
    setMaxStepReached(0);
    setSelectedFile(null);
    setParsingFile(false);
    setUploadError(null);
    setParsedCSV(null);
    setServerUploadResult(null);
    setServerUploadFileToken('');
    setFieldMappings({ ...EMPTY_FIELD_MAPPINGS });
    setPriceUnitValueMappings({});
    setModifierBundles([]);
    setRemainingDecisions({});
    setRowKeepSelections({});
    setRowEdits({});
    setPreviewDirty(false);
    setValidating(false);
    setValidationError(null);
    setMappingResult(null);
    setCommitting(false);
    setCommitError(null);
    setCommitSummary(null);
    setSaveMappingName('');
    setSaveMappingStatus(null);
    setSavedMappingsError(null);
  };

  const handleParseSelectedFile = async () => {
    if (!selectedFile) {
      setUploadError('Select a CSV file before continuing.');
      return;
    }

    if (!isCSVFile(selectedFile)) {
      setUploadError('Only CSV files are supported.');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setUploadError('CSV upload must be 5MB or smaller.');
      return;
    }

    setParsingFile(true);
    setUploadError(null);
    invalidateValidation();
    setCommitSummary(null);

    try {
      const text = await selectedFile.text();
      const parsed = parseCSVContent(text);
      setParsedCSV(parsed);
      setServerUploadResult(null);
      setServerUploadFileToken('');

      const autoMapped = autoMapHeaders(parsed.headers);
      setFieldMappings(autoMapped);
      setPriceUnitValueMappings({});
      setRowKeepSelections({});
      setRowEdits({});

      const mappedSet = new Set(
        Object.values(autoMapped)
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      );
      const remaining = parsed.headers.filter((header) => !mappedSet.has(header));
      const defaults: Record<string, RemainingDecision> = {};
      for (const column of remaining) {
        defaults[column] = {
          mode: 'unassigned',
          ruleType: '',
          label: column,
          softLabelConfirmed: false,
        };
      }
      setRemainingDecisions(defaults);
      setModifierBundles([]);
      setStep(0);
      setMaxStepReached((current) => (current > 1 ? current : 1));
    } catch (error) {
      setParsedCSV(null);
      setPriceUnitValueMappings({});
      setRowKeepSelections({});
      setRowEdits({});
      setUploadError(getErrorMessage(error, 'Unable to parse this CSV file.'));
    } finally {
      setParsingFile(false);
    }
  };

  const setSelectedCSVFile = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!isCSVFile(file)) {
      setSelectedFile(null);
      setUploadError('Only CSV files are supported.');
      return;
    }

    setSelectedFile(file);
    setUploadError(null);
  };

  const handleFileTriggerSelect = (files: FileList | null) => {
    const file = files?.[0] ?? null;
    setSelectedCSVFile(file);
  };

  const handleDrop = async (
    event: Parameters<NonNullable<ComponentProps<typeof DropZone>['onDrop']>>[0],
  ) => {
    const droppedFileItem = event.items.find((item) => isFileDropItem(item));
    if (!droppedFileItem) {
      setUploadError('Drop a CSV file to continue.');
      return;
    }

    const file = await droppedFileItem.getFile();
    setSelectedCSVFile(file);
  };

  const goToPriorStep = (targetStep: number) => {
    if (targetStep < 0 || targetStep > maxStepReached) {
      return;
    }
    setStep(targetStep as WizardStep);
  };

  const isRuleTypeTakenByOtherColumn = (ruleType: MenuImportRuleType, column: string): boolean => {
    for (const [otherColumn, decision] of Object.entries(remainingDecisions)) {
      if (otherColumn === column) {
        continue;
      }
      if (decision.mode === 'hard_rule' && decision.ruleType === ruleType) {
        return true;
      }
    }
    return false;
  };

  const handleCommit = async () => {
    if (uploadRowsWithSource.length === 0) {
      setCommitError('Select at least one row to keep before importing.');
      return;
    }
    if (previewDirty) {
      setCommitError('Refresh preview after edits before importing.');
      return;
    }
    if (hasUnresolvedDuplicateConflicts) {
      setCommitError('Resolve duplicate groups by checking only one row per duplicate set.');
      return;
    }
    if (!canCommit) {
      setCommitError('Resolve preview issues before importing.');
      return;
    }

    setCommitting(true);
    setCommitError(null);

    try {
      const uploadResult = await ensureServerUpload();
      if (!uploadResult?.import_session_id) {
        setCommitError('Unable to create an import session for commit.');
        return;
      }

      const summary = await commitMenuImportCSV(uploadResult.import_session_id);
      setCommitSummary(summary);
      setStep(4);
      setMaxStepReached((current) => (current > 4 ? current : 4));

      if (summary.error_count > 0) {
        setCommitError('Import completed with row errors. Review the results.');
      }
    } catch (error) {
      const httpError = error as HttpError | null;
      const summary = normalizeCommitSummary(httpError?.details);
      if (summary) {
        setCommitSummary(summary);
        setCommitError('Import completed with validation errors. Review the results.');
        setStep(4);
        setMaxStepReached((current) => (current > 4 ? current : 4));
      } else {
        setCommitError(getErrorMessage(error, 'Unable to commit import.'));
      }
    } finally {
      setCommitting(false);
    }
  };

  const fileSizeLabel =
    selectedFile && selectedFile.size > 0
      ? `${(selectedFile.size / 1024 / 1024).toFixed(2)}MB`
      : null;
  const renderDecisionCard = (column: string) => {
    const decision = getDecision(column);
    return (
      <div key={`decision-${column}`} className={styles.fieldRow}>
        <p className={styles.cardTitle}>{column}</p>
        <p className={styles.muted}>
          Sample: {getColumnSamples(column).join(' • ') || 'No sample values.'}
        </p>

        <label className={styles.inputLabel}>
          Action
          <select
            className={styles.selectControl}
            value={decision.mode}
            onChange={(event) => setDecisionMode(column, event.target.value as RemainingMode)}
          >
            <option value="unassigned">Choose an action...</option>
            <option value="hard_rule">Map as hard rule</option>
            <option value="soft_rule">Map as soft note</option>
            <option value="skip">Skip</option>
          </select>
        </label>

        {decision.mode === 'hard_rule' ? (
          <label className={styles.inputLabel}>
            Rule type
            <select
              className={styles.selectControl}
              value={decision.ruleType}
              onChange={(event) =>
                setDecisionRuleType(column, event.target.value as MenuImportRuleType | '')
              }
            >
              <option value="">Select rule type...</option>
              {RULE_TYPE_OPTIONS.map((option) => (
                <option
                  key={`${column}-${option.value}`}
                  value={option.value}
                  disabled={isRuleTypeTakenByOtherColumn(option.value, column)}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {decision.mode === 'hard_rule' && decision.ruleType ? (
          <p className={styles.helperSmall}>
            {RULE_TYPE_OPTIONS.find((option) => option.value === decision.ruleType)?.helper}
          </p>
        ) : null}

        {decision.mode === 'soft_rule' ? (
          <>
            <label className={styles.inputLabel}>
              Soft rule label
              <input
                type="text"
                className={styles.inputControl}
                value={decision.label}
                onChange={(event) => setDecisionLabel(column, event.target.value)}
                placeholder={column}
              />
            </label>
            {decision.softLabelConfirmed ? (
              <p className={styles.helperSmall}>Soft rule is configured.</p>
            ) : (
              <>
                <p className={styles.helperSmall}>
                  Confirm this soft rule before it moves to Addressed columns.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onPress={() => confirmSoftRuleDecision(column)}
                >
                  Confirm soft rule
                </Button>
              </>
            )}
          </>
        ) : null}
      </div>
    );
  };
  const renderBundleColumnOptions = (
    bundleID: string,
    slot: BundleSlotKey,
    selectedColumn: string,
  ) => {
    return (
      <>
        {bundleDropdownAvailableColumns.map((column) => (
          <option
            key={`${bundleID}-${slot}-${column}`}
            value={column}
            disabled={bundleUsedColumns.has(column) && selectedColumn !== column}
          >
            {column}
          </option>
        ))}
        {bundleDropdownAddressedColumns.length > 0 ? (
          <optgroup label="Addressed columns (unavailable)">
            {bundleDropdownAddressedColumns.map((column) => (
              <option key={`${bundleID}-${slot}-addressed-${column}`} value={column} disabled>
                {column}
              </option>
            ))}
          </optgroup>
        ) : null}
      </>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Import from a spreadsheet</h1>
          <p className={styles.subtitle}>
            Upload locally, map your columns, group modifier data, and confirm the exact import
            output.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onPress={() => navigate('/menus')}>
          Back to your menu
        </Button>
      </header>

      <ol className={styles.stepNav} aria-label="Import wizard steps">
        {STEP_LABELS.map((label, index) => {
          const reached = index <= maxStepReached;
          const active = step === index;
          return (
            <li key={label} className={styles.stepNavItem}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={styles.stepPill}
                data-active={active}
                data-reached={reached}
                onPress={() => goToPriorStep(index)}
                isDisabled={!reached}
              >
                <span className={styles.stepIndex}>{index + 1}</span>
                <span>{label}</span>
              </Button>
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 1: Upload &amp; Preview</h2>
          <p className={styles.helper}>
            Parse your CSV locally. No server upload happens in this step.
          </p>

          <DropZone
            aria-label="CSV upload drop zone"
            className={styles.dropZone}
            onDrop={handleDrop}
          >
            <Text slot="label" className={styles.dropZoneTitle}>
              Drag and drop your CSV here
            </Text>
            <p className={styles.dropZoneBody}>or choose a file from your computer</p>
            <FileTrigger
              acceptedFileTypes={['.csv', 'text/csv']}
              onSelect={handleFileTriggerSelect}
            >
              <Button type="button" variant="outline" size="sm">
                Browse files
              </Button>
            </FileTrigger>
            <p className={styles.dropHint}>CSV only, max 5MB</p>
          </DropZone>

          {selectedFile ? (
            <p className={styles.muted}>
              Selected: {selectedFile.name}
              {fileSizeLabel ? ` (${fileSizeLabel})` : ''}
            </p>
          ) : null}

          {uploadError ? (
            <p className={styles.error} role="alert">
              {uploadError}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => navigate('/menus')}>
              Cancel
            </Button>
            <Button
              type="button"
              onPress={() => void handleParseSelectedFile()}
              isDisabled={!selectedFile || parsingFile}
            >
              {parsingFile ? 'Parsing...' : 'Parse & preview'}
            </Button>
            {parsedCSV ? (
              <Button type="button" onPress={() => advanceStep(1)}>
                Next
              </Button>
            ) : null}
          </div>

          {parsedCSV ? (
            <>
              <div className={styles.previewHeader}>
                <p className={styles.success}>
                  Ready: {parsedCSV.totalRows} row(s), {parsedCSV.headers.length} column(s).
                </p>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {parsedCSV.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={`preview-${index}`}>
                        {parsedCSV.headers.map((header) => (
                          <td key={`preview-${index}-${header}`}>{row[header] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {savedMappingsLoading ? (
                <p className={styles.muted}>Loading saved mappings...</p>
              ) : null}
              {savedMappingsError ? <p className={styles.warning}>{savedMappingsError}</p> : null}
              {savedMappings.length > 0 ? (
                <div className={styles.fieldRow}>
                  <h3 className={styles.sectionTitle}>Saved mappings</h3>
                  <p className={styles.helperSmall}>
                    Choose a saved mapping to prefill this import. Full header matches auto-validate
                    and jump to preview.
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Updated</th>
                          <th>Expected columns</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedMappings.map((mapping) => {
                          const headers = new Set(parsedCSV.headers);
                          const missingCount = (mapping.expected_columns ?? []).filter(
                            (column) => !headers.has(column),
                          ).length;
                          return (
                            <tr key={mapping.id}>
                              <td>{mapping.name}</td>
                              <td>{formatDateTime(mapping.updated_at)}</td>
                              <td>
                                {mapping.expected_columns?.length ?? 0}
                                {missingCount > 0 ? ` (${missingCount} missing)` : ''}
                              </td>
                              <td>
                                <div className={styles.actions}>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onPress={() => void applySavedMapping(mapping)}
                                  >
                                    Use mapping
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onPress={() => void renameSavedMapping(mapping.id)}
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onPress={() => void deleteSavedMapping(mapping.id)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : !savedMappingsLoading && !savedMappingsError ? (
                <p className={styles.muted}>No saved mappings yet.</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 2: Required &amp; Optional Mapping</h2>
          <p className={styles.helper}>
            Map required and optional fields. A column can only be used once.
          </p>

          <div className={styles.fieldRow}>
            <h3 className={styles.sectionTitle}>Required fields</h3>
            {REQUIRED_FIELDS.map((field) => {
              const samples = getMappedFieldSamples(field.key);
              return (
                <div key={field.key} className={styles.fieldRow}>
                  <label className={styles.inputLabel}>
                    {field.label}
                    <select
                      value={fieldMappings[field.key]}
                      className={styles.selectControl}
                      onChange={(event) => setFieldMapping(field.key, event.target.value)}
                    >
                      <option value="">Select a column...</option>
                      {(parsedCSV?.headers ?? []).map((column) => (
                        <option
                          key={`${field.key}-${column}`}
                          value={column}
                          disabled={isHeaderUsedByOtherField(column, field.key)}
                        >
                          {column}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.helperSmall}>{field.helper}</p>
                  {samples.length > 0 ? (
                    <p className={styles.muted}>Sample: {samples.join(' • ')}</p>
                  ) : (
                    <p className={styles.muted}>No sample values yet.</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.fieldRow}>
            <h3 className={styles.sectionTitle}>Optional fields</h3>
            {OPTIONAL_FIELDS.map((field) => {
              const samples = getMappedFieldSamples(field.key);
              return (
                <div key={field.key} className={styles.fieldRow}>
                  <label className={styles.inputLabel}>
                    {field.label}
                    <select
                      value={fieldMappings[field.key]}
                      className={styles.selectControl}
                      onChange={(event) => setFieldMapping(field.key, event.target.value)}
                    >
                      <option value="">Skip this field</option>
                      {(parsedCSV?.headers ?? []).map((column) => (
                        <option
                          key={`${field.key}-${column}`}
                          value={column}
                          disabled={isHeaderUsedByOtherField(column, field.key)}
                        >
                          {column}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.helperSmall}>{field.helper}</p>
                  {samples.length > 0 ? (
                    <p className={styles.muted}>Sample: {samples.join(' • ')}</p>
                  ) : null}

                  {field.key === 'price_unit' && showPriceUnitValueMappingSection ? (
                    <div className={styles.fieldRow}>
                      <h4 className={styles.cardTitle}>Price Unit value mapping</h4>
                      <p className={styles.helperSmall}>
                        Map each unique source value to one target enum value.
                      </p>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>CSV value</th>
                              <th>Map to</th>
                            </tr>
                          </thead>
                          <tbody>
                            {priceUnitValuesRequiringManualMapping.map((sourceValue) => {
                              const normalizedSourceValue =
                                normalizePriceUnitSourceValue(sourceValue);
                              const currentValue =
                                resolvedPriceUnitValueMappings[normalizedSourceValue] ?? '';
                              return (
                                <tr key={`price-unit-value-${normalizedSourceValue}`}>
                                  <td>{sourceValue}</td>
                                  <td>
                                    <select
                                      value={currentValue}
                                      className={styles.selectControl}
                                      onChange={(event) =>
                                        setPriceUnitSourceMapping(
                                          sourceValue,
                                          event.target.value as MenuImportPriceUnit | '',
                                        )
                                      }
                                    >
                                      <option value="">Select a mapped value...</option>
                                      {PRICE_UNIT_OPTIONS.map((option) => (
                                        <option key={`price-unit-option-${option}`} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {requiredMissing.length > 0 ? (
            <p className={styles.warning}>
              Missing required mappings: {requiredMissing.map((field) => field.label).join(', ')}.
            </p>
          ) : null}
          {duplicateMappedHeaders.length > 0 ? (
            <p className={styles.warning}>
              Duplicate mapped columns are not allowed: {duplicateMappedHeaders.join(', ')}.
            </p>
          ) : null}
          {hasIncompletePriceUnitMappings ? (
            <p className={styles.warning}>
              Map all Price Unit values that need conversion before continuing:{' '}
              {missingPriceUnitSourceValues.slice(0, 8).join(' • ')}
              {missingPriceUnitSourceValues.length > 8 ? ' • ...' : ''}.
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => setStep(0)}>
              Back
            </Button>
            <Button
              type="button"
              onPress={() => {
                const remainingSet = new Set(unmappedColumnsAfterFields);
                const defaults: Record<string, RemainingDecision> = {};
                for (const column of unmappedColumnsAfterFields) {
                  defaults[column] = remainingDecisions[column] ?? {
                    mode: 'unassigned',
                    ruleType: '',
                    label: column,
                    softLabelConfirmed: false,
                  };
                }
                setRemainingDecisions(defaults);
                setModifierBundles((previous) =>
                  previous.map((bundle) => ({
                    ...bundle,
                    name_column: remainingSet.has(bundle.name_column) ? bundle.name_column : '',
                    choices_column: remainingSet.has(bundle.choices_column)
                      ? bundle.choices_column
                      : '',
                    pricing_column: remainingSet.has(bundle.pricing_column)
                      ? bundle.pricing_column
                      : '',
                    min_column: remainingSet.has(bundle.min_column) ? bundle.min_column : '',
                    max_column: remainingSet.has(bundle.max_column) ? bundle.max_column : '',
                  })),
                );
                advanceStep(2);
              }}
              isDisabled={
                requiredMissing.length > 0 ||
                duplicateMappedHeaders.length > 0 ||
                hasIncompletePriceUnitMappings
              }
            >
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 3: Column Grouping</h2>
          <p className={styles.helper}>
            Bundle columns for modifier groups, map remaining columns as hard rules or soft notes,
            and explicitly skip the rest.
          </p>

          <div className={styles.mappingGuide}>
            <p className={styles.mappingGuideTitle}>How to use this step</p>
            <p className={styles.mappingGuideText}>
              Some columns work together to define one modifier group, such as group name, choices,
              and pricing. Create bundles first, then map remaining columns as rules or notes.
            </p>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.previewHeader}>
              <h3 className={styles.sectionTitle}>Modifier group bundles</h3>
              <Button type="button" size="sm" variant="outline" onPress={addModifierBundle}>
                Create a modifier group bundle
              </Button>
            </div>

            {modifierBundles.length === 0 ? (
              <p className={styles.muted}>No modifier group bundles yet.</p>
            ) : null}

            {modifierBundles.map((bundle, index) => (
              <div key={bundle.id} className={styles.remainingCard}>
                <div className={styles.previewHeader}>
                  <p className={styles.cardTitle}>Bundle {index + 1}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onPress={() => removeModifierBundle(bundle.id)}
                  >
                    Remove bundle
                  </Button>
                </div>

                <label className={styles.inputLabel}>
                  Group Name column (required)
                  <select
                    className={styles.selectControl}
                    value={bundle.name_column}
                    onChange={(event) =>
                      updateBundleSlot(bundle.id, 'name_column', event.target.value)
                    }
                  >
                    <option value="">Select column...</option>
                    {renderBundleColumnOptions(bundle.id, 'name_column', bundle.name_column)}
                  </select>
                </label>

                <label className={styles.inputLabel}>
                  Choices column (required)
                  <select
                    className={styles.selectControl}
                    value={bundle.choices_column}
                    onChange={(event) =>
                      updateBundleSlot(bundle.id, 'choices_column', event.target.value)
                    }
                  >
                    <option value="">Select column...</option>
                    {renderBundleColumnOptions(bundle.id, 'choices_column', bundle.choices_column)}
                  </select>
                </label>

                <label className={styles.inputLabel}>
                  Pricing column (optional)
                  <select
                    className={styles.selectControl}
                    value={bundle.pricing_column}
                    onChange={(event) =>
                      updateBundleSlot(bundle.id, 'pricing_column', event.target.value)
                    }
                  >
                    <option value="">No pricing column</option>
                    {renderBundleColumnOptions(bundle.id, 'pricing_column', bundle.pricing_column)}
                  </select>
                </label>

                <label className={styles.inputLabel}>
                  Min Selections column (optional)
                  <select
                    className={styles.selectControl}
                    value={bundle.min_column}
                    onChange={(event) =>
                      updateBundleSlot(bundle.id, 'min_column', event.target.value)
                    }
                  >
                    <option value="">No min column (defaults to 0)</option>
                    {renderBundleColumnOptions(bundle.id, 'min_column', bundle.min_column)}
                  </select>
                </label>

                <label className={styles.inputLabel}>
                  Max Selections column (optional)
                  <select
                    className={styles.selectControl}
                    value={bundle.max_column}
                    onChange={(event) =>
                      updateBundleSlot(bundle.id, 'max_column', event.target.value)
                    }
                  >
                    <option value="">No max column (defaults to unlimited)</option>
                    {renderBundleColumnOptions(bundle.id, 'max_column', bundle.max_column)}
                  </select>
                </label>

                <label className={styles.inputLabel}>
                  Choice delimiter
                  <select
                    className={styles.selectControl}
                    value={bundle.choice_delimiter}
                    onChange={(event) => updateBundleDelimiter(bundle.id, event.target.value)}
                  >
                    {DELIMITER_OPTIONS.map((delimiter) => (
                      <option key={`${bundle.id}-delimiter-${delimiter}`} value={delimiter}>
                        {delimiter}
                      </option>
                    ))}
                  </select>
                </label>

                {incompleteBundleIDs.has(bundle.id) ? (
                  <p className={styles.warning}>
                    Group Name and Choices are required for each configured bundle.
                  </p>
                ) : null}

                <p className={styles.muted}>
                  Sample rows:{' '}
                  {uniqueSampleValues(
                    (parsedCSV?.rows ?? []).slice(0, 4).map((row) => {
                      const name = bundle.name_column ? (row[bundle.name_column] ?? '') : '';
                      const choices = bundle.choices_column
                        ? (row[bundle.choices_column] ?? '')
                        : '';
                      const pricing = bundle.pricing_column
                        ? (row[bundle.pricing_column] ?? '')
                        : '';
                      return `Name=${name || '—'} | Choices=${choices || '—'} | Pricing=${pricing || '—'}`;
                    }),
                    3,
                  ).join(' • ') || 'No data yet.'}
                </p>
              </div>
            ))}
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.previewHeader}>
              <h3 className={styles.sectionTitle}>Remaining columns</h3>
              <Button type="button" size="sm" variant="outline" onPress={setAllDecisionModesToSkip}>
                Skip all remaining
              </Button>
            </div>

            {columnsAvailableForDecision.length === 0 ? (
              <p className={styles.muted}>No columns left after bundle assignments.</p>
            ) : pendingDecisionColumns.length === 0 ? (
              <p className={styles.muted}>All columns have been addressed.</p>
            ) : (
              pendingDecisionColumns.map((column) => renderDecisionCard(column))
            )}
          </div>

          {columnsAvailableForDecision.length > 0 ? (
            <div className={styles.fieldRow}>
              <h3 className={styles.sectionTitle}>Addressed columns</h3>
              {addressedDecisionColumns.length === 0 ? (
                <p className={styles.muted}>No addressed columns yet.</p>
              ) : (
                addressedDecisionColumns.map((column) => renderDecisionCard(column))
              )}
            </div>
          ) : null}

          {pendingDecisionColumns.length > 0 ? (
            <p className={styles.warning}>
              Complete actions for remaining columns (select hard-rule type and confirm soft-rule
              labels): {pendingDecisionColumns.join(', ')}.
            </p>
          ) : null}
          {missingRuleTypeColumns.length > 0 ? (
            <p className={styles.warning}>
              Select a hard rule type for: {missingRuleTypeColumns.join(', ')}.
            </p>
          ) : null}
          {duplicateRuleTypes.length > 0 ? (
            <p className={styles.warning}>
              Each hard rule type can only be mapped once. Duplicate:{' '}
              {duplicateRuleTypes.join(', ')}.
            </p>
          ) : null}
          {validationError ? (
            <p className={styles.error} role="alert">
              {validationError}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onPress={() => void runValidation(false)}
              isDisabled={!step3Ready || validating}
            >
              {validating ? 'Validating...' : 'Validate mapping'}
            </Button>
            <Button
              type="button"
              onPress={() => void runValidation(true)}
              isDisabled={!step3Ready || validating}
            >
              {validating ? 'Validating...' : 'Next'}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 4: Preview &amp; Confirm</h2>
          <p className={styles.helper}>
            Review the exact import output, row-level issues, and duplicate-item handling before
            commit.
          </p>

          {mappingResult ? (
            <>
              <div className={styles.summaryRow}>
                <span>Total rows: {mappingResult.validated_preview.length}</span>
                <span>
                  Rows selected to import: {uploadRowsWithSource.length} / {rowsWithEdits.length}
                </span>
                <span>Rows with errors: {mappingResult.row_errors.length}</span>
                <span>Unresolved duplicate sets: {unresolvedDuplicateConflicts.length}</span>
                <span>
                  Modifier groups to create:{' '}
                  {mappingResult.modifier_groups.filter((group) => !group.exists).length}
                </span>
                <span>
                  Hard rules resolved:{' '}
                  {mappingResult.validated_preview.reduce(
                    (sum, row) => sum + (row.rules?.length ?? 0),
                    0,
                  )}
                </span>
              </div>

              {duplicateConflicts.length > 0 ? (
                <div className={styles.issueBlock}>
                  <h3 className={styles.issueTitle}>Duplicate Resolver</h3>
                  <p className={styles.helperSmall}>
                    Check each row you want to keep. You can also rename/re-SKU by editing values
                    below.
                  </p>
                  {duplicateConflicts.map((conflict, index) => {
                    const selectedCount = conflict.rows.filter((rowNumber) =>
                      isSourceRowKept(rowNumber),
                    ).length;
                    const isResolved = selectedCount <= 1;
                    return (
                      <div key={`duplicate-group-${index}`} className={styles.fieldRow}>
                        <p className={styles.cardTitle}>
                          {conflict.kind === 'name' ? 'Item Name' : 'SKU'}: "{conflict.value}"
                        </p>
                        <p className={styles.muted}>
                          {isResolved
                            ? 'Resolved: one or fewer rows are selected.'
                            : `${selectedCount} rows are selected. Keep only one row in this set.`}
                        </p>
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>Keep</th>
                                <th>CSV row</th>
                                {(parsedCSV?.headers ?? []).map((header) => (
                                  <th key={`duplicate-header-${index}-${header}`}>{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {conflict.rows.map((sourceRowNumber) => {
                                const row = rowsBySourceRowNumber.get(sourceRowNumber) ?? {};
                                return (
                                  <tr key={`duplicate-row-${index}-${sourceRowNumber}`}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={isSourceRowKept(sourceRowNumber)}
                                        onChange={(event) =>
                                          setSourceRowKept(sourceRowNumber, event.target.checked)
                                        }
                                      />
                                    </td>
                                    <td>{sourceRowNumber}</td>
                                    {(parsedCSV?.headers ?? []).map((header) => (
                                      <td
                                        key={`duplicate-cell-${index}-${sourceRowNumber}-${header}`}
                                      >
                                        <input
                                          type="text"
                                          className={styles.inputControl}
                                          value={row[header] ?? ''}
                                          onChange={(event) =>
                                            setSourceRowCellValue(
                                              sourceRowNumber,
                                              header,
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                  {hasUnresolvedDuplicateConflicts ? (
                    <p className={styles.warning}>
                      Resolve all duplicate sets before importing by checking only one row per set.
                    </p>
                  ) : (
                    <p className={styles.success}>All duplicate sets are resolved.</p>
                  )}
                </div>
              ) : null}

              {mappingResult.row_errors.length > 0 ? (
                <div className={styles.issueBlock}>
                  <h3 className={styles.issueTitle}>Rows with validation errors</h3>
                  <p className={styles.helperSmall}>
                    Fix the values directly below, then click Refresh preview.
                  </p>
                  <ul className={styles.issueList}>
                    {rowErrorFixEntries.map((entry) => (
                      <li key={`row-error-${entry.previewRowNumber}`}>
                        Preview row {entry.previewRowNumber} (CSV row {entry.sourceRowNumber}):{' '}
                        {entry.errors.map((issue) => explainValidationIssue(issue)).join('; ')}
                      </li>
                    ))}
                  </ul>
                  {rowErrorFixEntries.length > 0 ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Preview row</th>
                            <th>CSV row</th>
                            <th>Issues</th>
                            {(parsedCSV?.headers ?? []).map((header) => (
                              <th key={`row-error-header-${header}`}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rowErrorFixEntries.map((entry) => (
                            <tr key={`row-error-fix-${entry.previewRowNumber}`}>
                              <td>{entry.previewRowNumber}</td>
                              <td>{entry.sourceRowNumber}</td>
                              <td>
                                {entry.errors
                                  .map((issue) => explainValidationIssue(issue))
                                  .join('; ')}
                              </td>
                              {(parsedCSV?.headers ?? []).map((header) => (
                                <td key={`row-error-cell-${entry.previewRowNumber}-${header}`}>
                                  <input
                                    type="text"
                                    className={styles.inputControl}
                                    value={entry.row[header] ?? ''}
                                    onChange={(event) =>
                                      setSourceRowCellValue(
                                        entry.sourceRowNumber,
                                        header,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {groupedPreview.map(([category, rows]) => (
                <div key={`preview-group-${category}`} className={styles.fieldRow}>
                  <h3 className={styles.sectionTitle}>{category}</h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Status</th>
                          <th>Name</th>
                          <th>Price</th>
                          <th>Description</th>
                          <th>SKU</th>
                          <th>Serving</th>
                          <th>Dietary Tags</th>
                          <th>Allergens</th>
                          <th>Hard Rules</th>
                          <th>Soft Rules</th>
                          <th>Modifier Groups</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const rowErrors = rowErrorsByRow.get(row.row) ?? [];
                          const status = rowErrors.length > 0 ? 'Issue' : 'Ready';
                          const localRow = uploadRowsWithSource[row.row - 1]?.row;
                          const softRuleLines = columnsAvailableForDecision
                            .filter((column) => {
                              const decision = getDecision(column);
                              return decision.mode === 'soft_rule';
                            })
                            .map((column) => {
                              const decision = getDecision(column);
                              const content = (localRow?.[column] ?? '').trim();
                              if (!content) {
                                return '';
                              }
                              return `${decision.label.trim() || column}: ${content}`;
                            })
                            .filter((value) => value.length > 0);

                          return (
                            <tr
                              key={`preview-row-${row.row}`}
                              data-has-errors={rowErrors.length > 0}
                            >
                              <td>{row.row}</td>
                              <td>{status}</td>
                              <td>{row.name || 'Missing'}</td>
                              <td>{formatPrice(row.price, row.price_unit)}</td>
                              <td>{row.description || '—'}</td>
                              <td>{row.sku || '—'}</td>
                              <td>{row.serving_description || '—'}</td>
                              <td>{row.dietary_tags || '—'}</td>
                              <td>{row.allergens || '—'}</td>
                              <td>
                                {row.rules && row.rules.length > 0
                                  ? row.rules
                                      .map((rule) => `${rule.rule_type}: ${rule.value}`)
                                      .join(' • ')
                                  : '—'}
                              </td>
                              <td>{softRuleLines.length > 0 ? softRuleLines.join(' • ') : '—'}</td>
                              <td>
                                {row.modifier_groups && row.modifier_groups.length > 0
                                  ? row.modifier_groups
                                      .map((group) => {
                                        const options = group.options
                                          .map(
                                            (option) =>
                                              `${option.name} (${formatPrice(option.price_adjustment, 'flat')})`,
                                          )
                                          .join(', ');
                                        return `${group.name} [${group.min_selections}-${group.max_selections}]: ${options}`;
                                      })
                                      .join(' • ')
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className={styles.warning}>
              No validated preview is available yet. Re-run validation in Step 3.
            </p>
          )}

          {commitError ? (
            <p className={styles.error} role="alert">
              {commitError}
            </p>
          ) : null}
          {validationError ? <p className={styles.warning}>{validationError}</p> : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => setStep(2)}>
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onPress={() => void runValidation(false)}
              isDisabled={validating}
            >
              {validating ? 'Refreshing...' : 'Refresh preview'}
            </Button>
            <Button type="button" onPress={handleCommit} isDisabled={!canCommit}>
              {committing ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 5: Commit + Results</h2>
          <p className={styles.helper}>
            Import is complete. Review outcomes and optionally save this mapping.
          </p>

          {commitSummary ? (
            <div className={styles.commitSummary}>
              <p className={styles.muted}>
                Items created: {commitSummary.created_count} • Items updated:{' '}
                {commitSummary.updated_count} • Row errors: {commitSummary.error_count}
              </p>
              <p className={styles.muted}>
                Modifier groups created: {commitSummary.modifier_groups_created ?? 0} • Modifier
                groups reused: {commitSummary.modifier_groups_reused ?? 0} • Hard rules created:{' '}
                {commitSummary.hard_rules_created ?? 0} • Soft rules created:{' '}
                {commitSummary.soft_rules_created ?? 0} • Rows skipped:{' '}
                {commitSummary.rows_skipped ?? 0}
              </p>
              {commitSummary.errors.length > 0 ? (
                <ul className={styles.issueList}>
                  {commitSummary.errors.map((error, index) => (
                    <li key={`commit-err-${index}`}>
                      {typeof error.row === 'number' ? `Row ${error.row}: ` : ''}
                      {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className={styles.warning}>No commit summary is available.</p>
          )}

          <div className={styles.fieldRow}>
            <h3 className={styles.sectionTitle}>Save this mapping for future imports?</h3>
            <label className={styles.inputLabel}>
              Mapping name
              <input
                type="text"
                className={styles.inputControl}
                value={saveMappingName}
                onChange={(event) => setSaveMappingName(event.target.value)}
                placeholder={selectedFile?.name.replace(/\.csv$/i, '') || 'My mapping'}
              />
            </label>
            {saveMappingStatus ? <p className={styles.success}>{saveMappingStatus}</p> : null}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="outline"
                onPress={() => void handleSaveCurrentMapping()}
              >
                Save mapping
              </Button>
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="button" onPress={() => navigate('/menus')}>
              View your items
            </Button>
            <Button type="button" variant="outline" onPress={resetWizard}>
              Import another file
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
