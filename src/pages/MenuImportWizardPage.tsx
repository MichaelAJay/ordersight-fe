import { useMemo, useState, type ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropZone, FileTrigger, ProgressBar, Text, isFileDropItem } from 'react-aria-components';
import { Button } from '@/components/common/Button/Button';
import {
  PartitionBoard,
  type PartitionBoardBucket,
  type PartitionBoardItem,
} from '@/components/common/PartitionBoard/PartitionBoard';
import { HttpError } from '@/services/http';
import {
  commitMenuImportCSV,
  mapMenuImportCSV,
  uploadMenuImportCSV,
  type MenuImportColumnGroupMapping,
  type MenuImportCommitSummary,
  type MenuImportMappingRequest,
  type MenuImportMappingValidationResult,
  type MenuImportUploadResponse,
} from '@/services/menuImport';
import styles from './MenuImportWizardPage.module.css';

type MappingKey = 'name' | 'price' | 'description' | 'category' | 'price_unit';
type ColumnMode = 'unassigned' | 'skip' | 'variant' | 'modifier';
type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

type ColumnAction = {
  mode: ColumnMode;
  groupName: string;
};

type PartitionBucket = 'unassigned' | 'variant' | 'modifier' | 'skip';
type CanonicalPriceUnit = 'flat' | 'per_person' | 'per_unit';

const STEP_LABELS = [
  'Upload',
  'Required mapping',
  'Optional mapping',
  'Remaining columns',
  'Preview',
];
const PARTITION_BUCKETS: PartitionBoardBucket[] = [
  { id: 'unassigned', label: 'Unassigned', emptyLabel: 'Drop columns here' },
  { id: 'variant', label: 'Size/Option', emptyLabel: 'No size/option columns yet' },
  { id: 'modifier', label: 'Customization', emptyLabel: 'No customization columns yet' },
  { id: 'skip', label: 'Skip', emptyLabel: 'No skipped columns' },
];
const MODE_OPTIONS: Array<{ mode: ColumnMode; label: string }> = [
  { mode: 'variant', label: 'Size/Option' },
  { mode: 'modifier', label: 'Customization' },
  { mode: 'skip', label: 'Skip' },
  { mode: 'unassigned', label: 'Clear' },
];

const REQUIRED_FIELDS: Array<{
  key: Extract<MappingKey, 'name' | 'price'>;
  label: string;
  helper: string;
  suggestions: string[];
}> = [
  {
    key: 'name',
    label: 'Item Name',
    helper: 'Required. This is the item title shown in your catalog.',
    suggestions: ['item', 'item name', 'name', 'product'],
  },
  {
    key: 'price',
    label: 'Price',
    helper: 'Required. Values like 12.50 or $12.50 are accepted.',
    suggestions: ['price', 'cost', 'amount', 'item price'],
  },
];

const OPTIONAL_FIELDS: Array<{
  key: Extract<MappingKey, 'description' | 'category' | 'price_unit'>;
  label: string;
  helper: string;
  suggestions: string[];
}> = [
  {
    key: 'description',
    label: 'Description',
    helper: 'Optional. Longer text customers or staff can read.',
    suggestions: ['description', 'details', 'item description'],
  },
  {
    key: 'category',
    label: 'Category',
    helper: 'Optional. Creates categories if they do not exist yet.',
    suggestions: ['category', 'section', 'menu section', 'group'],
  },
  {
    key: 'price_unit',
    label: 'Price Unit',
    helper: 'Optional. flat, per_person, or per_unit.',
    suggestions: ['price unit', 'pricing unit', 'unit', 'per person', 'per unit'],
  },
];

const EMPTY_FIELD_MAPPINGS: Record<MappingKey, string> = {
  name: '',
  price: '',
  description: '',
  category: '',
  price_unit: '',
};
const CANONICAL_PRICE_UNITS = new Set<CanonicalPriceUnit>(['flat', 'per_person', 'per_unit']);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePriceUnitValue(value: string): string {
  return normalizeKey(value).replace(/[\s-]+/g, '_');
}

function isCanonicalPriceUnit(value: string): value is CanonicalPriceUnit {
  return CANONICAL_PRICE_UNITS.has(normalizePriceUnitValue(value) as CanonicalPriceUnit);
}

function isPartitionBucket(value: string): value is PartitionBucket {
  return value === 'unassigned' || value === 'variant' || value === 'modifier' || value === 'skip';
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

function autoMapHeaders(
  columns: string[],
  previewRows: Array<Record<string, string>>,
): Record<MappingKey, string> {
  const mapped: Record<MappingKey, string> = { ...EMPTY_FIELD_MAPPINGS };
  const used = new Set<string>();
  const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

  for (const field of allFields) {
    for (const column of columns) {
      if (used.has(column)) {
        continue;
      }
      const normalizedColumn = normalizeKey(column);
      if (
        field.suggestions.some((suggestion) => normalizedColumn.includes(normalizeKey(suggestion)))
      ) {
        if (field.key === 'price_unit') {
          const priceUnitSamples = uniqueSampleValues(
            previewRows.map((row) => {
              const value = row[column];
              return typeof value === 'string' ? value : '';
            }),
            10,
          );
          const hasSamples = priceUnitSamples.length > 0;
          const allSamplesCanonical = priceUnitSamples.every((sample) =>
            isCanonicalPriceUnit(sample),
          );
          if (!hasSamples || !allSamplesCanonical) {
            continue;
          }
        }
        mapped[field.key] = column;
        used.add(column);
        break;
      }
    }
  }

  return mapped;
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
  };
}

function isCSVFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  return (
    name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
  );
}

export function MenuImportWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>(0);
  const [maxStepReached, setMaxStepReached] = useState<WizardStep>(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<MenuImportUploadResponse | null>(null);

  const [fieldMappings, setFieldMappings] = useState<Record<MappingKey, string>>({
    ...EMPTY_FIELD_MAPPINGS,
  });
  const [columnActions, setColumnActions] = useState<Record<string, ColumnAction>>({});
  const [activeRemainingIndex, setActiveRemainingIndex] = useState(0);

  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mappingResult, setMappingResult] = useState<MenuImportMappingValidationResult | null>(
    null,
  );

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<MenuImportCommitSummary | null>(null);

  const allMappedHeaders = useMemo(
    () => Object.values(fieldMappings).filter((column) => column.trim().length > 0),
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

  const remainingColumns = useMemo(() => {
    const columnSet = new Set(allMappedHeaders);
    return (uploadResult?.column_names ?? []).filter((column) => !columnSet.has(column));
  }, [allMappedHeaders, uploadResult?.column_names]);

  const unsupportedPriceUnitSamples = useMemo(() => {
    const column = fieldMappings.price_unit.trim();
    if (!column) {
      return [] as string[];
    }

    const values = (uploadResult?.preview_rows ?? []).map((row) => {
      const value = row[column];
      return typeof value === 'string' ? value : '';
    });

    return uniqueSampleValues(
      values.filter((value) => value.trim() && !isCanonicalPriceUnit(value)),
    );
  }, [fieldMappings.price_unit, uploadResult?.preview_rows]);

  const hasUnsupportedPriceUnitSelection =
    fieldMappings.price_unit.trim().length > 0 && unsupportedPriceUnitSamples.length > 0;

  const rowErrorsByRow = useMemo(() => {
    const out = new Map<number, string[]>();
    for (const rowError of mappingResult?.row_errors ?? []) {
      out.set(rowError.row, rowError.errors);
    }
    return out;
  }, [mappingResult?.row_errors]);

  const modifierGroupStatus = useMemo(() => {
    const out = new Map<string, boolean>();
    for (const group of mappingResult?.modifier_groups ?? []) {
      out.set(normalizeKey(group.group_name), group.exists);
    }
    return out;
  }, [mappingResult?.modifier_groups]);

  const mappedColumnSamples = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const mappedColumn of mappingResult?.mapped_columns ?? []) {
      out.set(mappedColumn.field, mappedColumn.sample_values);
    }
    return out;
  }, [mappingResult?.mapped_columns]);

  const remainingColumnSamples = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const remainingColumn of mappingResult?.remaining_columns ?? []) {
      out.set(remainingColumn.column, remainingColumn.sample_values);
    }
    return out;
  }, [mappingResult?.remaining_columns]);

  const hasBlockingValidationErrors = (mappingResult?.row_errors.length ?? 0) > 0;
  const canCommit =
    !hasBlockingValidationErrors && mappingResult !== null && !validating && !committing;

  const invalidateValidation = () => {
    setValidationError(null);
    setMappingResult(null);
    setCommitSummary(null);
    setCommitError(null);
  };

  const advanceStep = (target: WizardStep) => {
    setStep(target);
    setMaxStepReached((current) => (current > target ? current : target));
  };

  const resetWizard = () => {
    setStep(0);
    setMaxStepReached(0);
    setSelectedFile(null);
    setUploading(false);
    setUploadError(null);
    setUploadResult(null);
    setFieldMappings({ ...EMPTY_FIELD_MAPPINGS });
    setColumnActions({});
    setActiveRemainingIndex(0);
    setValidating(false);
    setValidationError(null);
    setMappingResult(null);
    setCommitting(false);
    setCommitError(null);
    setCommitSummary(null);
  };

  const isHeaderUsedByOtherField = (column: string, field: MappingKey): boolean =>
    Object.entries(fieldMappings).some(([key, mapped]) => key !== field && mapped === column);

  const getColumnSamples = (column: string): string[] => {
    const mappedSamples = remainingColumnSamples.get(column);
    if (mappedSamples && mappedSamples.length > 0) {
      return mappedSamples;
    }

    const uploadSamples = (uploadResult?.preview_rows ?? []).map((row) => {
      const value = row[column];
      return typeof value === 'string' ? value : '';
    });
    return uniqueSampleValues(uploadSamples);
  };

  const getMappedFieldSamples = (field: MappingKey): string[] => {
    const apiFieldKey =
      field === 'name' || field === 'price' ? `required.${field}` : `optional.${field}`;
    const fromValidation = mappedColumnSamples.get(apiFieldKey);
    if (fromValidation && fromValidation.length > 0) {
      return fromValidation;
    }
    const column = fieldMappings[field];
    if (!column) {
      return [];
    }
    const uploadSamples = (uploadResult?.preview_rows ?? []).map((row) => {
      const value = row[column];
      return typeof value === 'string' ? value : '';
    });
    return uniqueSampleValues(uploadSamples);
  };

  const getColumnAction = (column: string): ColumnAction => {
    return columnActions[column] ?? { mode: 'unassigned', groupName: column };
  };

  const isColumnActionComplete = (column: string): boolean => {
    const action = getColumnAction(column);
    if (action.mode === 'unassigned') {
      return false;
    }
    if (action.mode === 'skip') {
      return true;
    }
    return (action.groupName.trim() || column).length > 0;
  };

  const remainingCompletionCount = useMemo(
    () => remainingColumns.filter((column) => isColumnActionComplete(column)).length,
    [columnActions, remainingColumns],
  );

  const remainingDecisionPendingCount = remainingColumns.length - remainingCompletionCount;

  const safeRemainingIndex = useMemo(() => {
    if (remainingColumns.length === 0) {
      return -1;
    }
    if (activeRemainingIndex < 0) {
      return 0;
    }
    if (activeRemainingIndex >= remainingColumns.length) {
      return remainingColumns.length - 1;
    }
    return activeRemainingIndex;
  }, [activeRemainingIndex, remainingColumns.length]);

  const activeRemainingColumn =
    safeRemainingIndex >= 0 ? remainingColumns[safeRemainingIndex] : null;
  const activeRemainingConfig = activeRemainingColumn
    ? getColumnAction(activeRemainingColumn)
    : null;
  const activeRemainingSamples = activeRemainingColumn
    ? getColumnSamples(activeRemainingColumn)
    : [];

  const activeRemainingModifierExists =
    activeRemainingColumn && activeRemainingConfig && activeRemainingConfig.mode === 'modifier'
      ? modifierGroupStatus.get(
          normalizeKey(activeRemainingConfig.groupName.trim() || activeRemainingColumn),
        )
      : undefined;

  const partitionItems = useMemo<PartitionBoardItem[]>(
    () =>
      remainingColumns.map((column) => {
        const action = columnActions[column] ?? { mode: 'unassigned', groupName: column };
        const subtitle =
          action.mode === 'variant' || action.mode === 'modifier'
            ? action.groupName.trim() || column
            : action.mode === 'skip'
              ? 'Skipped'
              : undefined;
        return {
          id: column,
          bucketId: action.mode,
          title: column,
          subtitle,
        };
      }),
    [columnActions, remainingColumns],
  );

  const canRunValidation =
    Boolean(uploadResult?.import_session_id) &&
    requiredMissing.length === 0 &&
    duplicateMappedHeaders.length === 0 &&
    remainingDecisionPendingCount === 0;

  const setFieldMapping = (key: MappingKey, column: string) => {
    setFieldMappings((previous) => ({ ...previous, [key]: column }));
    invalidateValidation();
  };

  const setColumnAction = (column: string, update: Partial<ColumnAction>) => {
    setColumnActions((previous) => {
      const current = previous[column] ?? { mode: 'unassigned', groupName: column };
      return {
        ...previous,
        [column]: {
          ...current,
          ...update,
        },
      };
    });
    invalidateValidation();
  };

  const setActiveColumnMode = (mode: ColumnMode) => {
    if (!activeRemainingColumn) {
      return;
    }

    const current = columnActions[activeRemainingColumn] ?? {
      mode: 'unassigned',
      groupName: activeRemainingColumn,
    };
    const nextGroupName =
      mode === 'variant' || mode === 'modifier'
        ? current.groupName.trim() || activeRemainingColumn
        : current.groupName;

    setColumnAction(activeRemainingColumn, { mode, groupName: nextGroupName });

    if (
      mode !== 'unassigned' &&
      current.mode !== mode &&
      safeRemainingIndex >= 0 &&
      safeRemainingIndex < remainingColumns.length - 1
    ) {
      setActiveRemainingIndex(safeRemainingIndex + 1);
    }
  };

  const handleMoveRemainingColumn = (column: string, toBucketId: string) => {
    if (!isPartitionBucket(toBucketId)) {
      return;
    }

    const current = columnActions[column] ?? { mode: 'unassigned', groupName: column };
    const nextGroupName =
      toBucketId === 'variant' || toBucketId === 'modifier'
        ? current.groupName.trim() || column
        : current.groupName;

    setColumnAction(column, { mode: toBucketId, groupName: nextGroupName });

    const nextIndex = remainingColumns.indexOf(column);
    if (nextIndex >= 0) {
      setActiveRemainingIndex(nextIndex);
    }
  };

  const buildMappingPayload = (): MenuImportMappingRequest | null => {
    const required = {
      name: fieldMappings.name.trim(),
      price: fieldMappings.price.trim(),
    };
    if (!required.name || !required.price) {
      return null;
    }

    const optional: MenuImportMappingRequest['optional'] = {};
    if (fieldMappings.description.trim()) {
      optional.description = fieldMappings.description.trim();
    }
    if (fieldMappings.category.trim()) {
      optional.category = fieldMappings.category.trim();
    }
    if (fieldMappings.price_unit.trim()) {
      optional.price_unit = fieldMappings.price_unit.trim();
    }

    const variants: MenuImportColumnGroupMapping[] = [];
    const modifiers: MenuImportColumnGroupMapping[] = [];

    for (const column of remainingColumns) {
      const config = getColumnAction(column);
      if (config.mode === 'unassigned' || config.mode === 'skip') {
        continue;
      }

      const groupName = config.groupName.trim() || column;
      if (config.mode === 'variant') {
        variants.push({ column, group_name: groupName });
      }
      if (config.mode === 'modifier') {
        modifiers.push({ column, group_name: groupName });
      }
    }

    return {
      required,
      optional: Object.keys(optional).length > 0 ? optional : undefined,
      variants: variants.length > 0 ? variants : undefined,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
    };
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Select a CSV file before uploading.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setValidationError(null);
    setMappingResult(null);
    setCommitError(null);
    setCommitSummary(null);

    try {
      const result = await uploadMenuImportCSV(selectedFile);
      setUploadResult(result);

      const autoMapped = autoMapHeaders(result.column_names, result.preview_rows);
      setFieldMappings(autoMapped);

      const mappedSet = new Set(Object.values(autoMapped).filter((value) => value));
      const nextActions: Record<string, ColumnAction> = {};
      for (const column of result.column_names) {
        if (!mappedSet.has(column)) {
          nextActions[column] = { mode: 'unassigned', groupName: column };
        }
      }
      setColumnActions(nextActions);
      setActiveRemainingIndex(0);

      setStep(0);
      setMaxStepReached((current) => (current > 1 ? current : 1));
    } catch (error) {
      setUploadError(getErrorMessage(error, 'Unable to upload this CSV file.'));
    } finally {
      setUploading(false);
    }
  };

  const runValidation = async (advanceToPreview: boolean) => {
    if (!uploadResult?.import_session_id) {
      setValidationError('Upload a CSV before validating mappings.');
      return;
    }
    if (remainingDecisionPendingCount > 0) {
      setValidationError('Choose how to handle each remaining column before validation.');
      return;
    }

    const payload = buildMappingPayload();
    if (!payload) {
      setValidationError('Map Item Name and Price before continuing.');
      return;
    }

    setValidating(true);
    setValidationError(null);
    setCommitError(null);
    setCommitSummary(null);

    try {
      const result = await mapMenuImportCSV(uploadResult.import_session_id, payload);
      setMappingResult(result);
      if (advanceToPreview) {
        advanceStep(4);
      }
    } catch (error) {
      setValidationError(getErrorMessage(error, 'Unable to validate your import mapping.'));
    } finally {
      setValidating(false);
    }
  };

  const handleCommit = async () => {
    if (!uploadResult?.import_session_id) {
      setCommitError('Upload and validate a file before confirming import.');
      return;
    }
    if (!canCommit) {
      setCommitError('Resolve row issues before confirming import.');
      return;
    }

    setCommitting(true);
    setCommitError(null);

    try {
      const summary = await commitMenuImportCSV(uploadResult.import_session_id);
      setCommitSummary(summary);

      if (summary.error_count > 0) {
        setCommitError('Import completed with errors. Review the summary below.');
        return;
      }

      setStep(5);
    } catch (error) {
      const httpError = error as HttpError | null;
      const summary = normalizeCommitSummary(httpError?.details);
      if (summary) {
        setCommitSummary(summary);
        setCommitError('Import could not be completed because some rows are invalid.');
      } else {
        setCommitError(getErrorMessage(error, 'Unable to commit import.'));
      }
    } finally {
      setCommitting(false);
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
    if (targetStep < 0 || targetStep > maxStepReached || step === 5) {
      return;
    }
    setStep(targetStep as WizardStep);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Import from a spreadsheet</h1>
          <p className={styles.subtitle}>
            Bring your menu in quickly with guided mapping, validation, and one final confirmation.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onPress={() => navigate('/menus')}>
          Back to your menu
        </Button>
      </header>

      <ol className={styles.stepNav} aria-label="Import wizard steps">
        {STEP_LABELS.map((label, index) => {
          const reached = index <= maxStepReached || step === 5;
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
                isDisabled={!reached || step === 5}
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
          <h2 className={styles.sectionTitle}>Step 1: Upload</h2>
          <p className={styles.helper}>
            Upload a CSV file. We will show headers, sample rows, and row count before moving on.
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

          {selectedFile ? <p className={styles.muted}>Selected: {selectedFile.name}</p> : null}
          {uploadError ? (
            <p className={styles.error} role="alert">
              {uploadError}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" onPress={handleUpload} isDisabled={!selectedFile || uploading}>
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </Button>
          </div>

          {uploadResult ? (
            <>
              <div className={styles.previewHeader}>
                <p className={styles.success}>
                  Uploaded {uploadResult.total_row_count} row(s) with{' '}
                  {uploadResult.column_names.length} column(s).
                </p>
                <Button type="button" onPress={() => advanceStep(1)}>
                  Continue to required mapping
                </Button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {uploadResult.column_names.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.preview_rows.map((row, index) => (
                      <tr key={`preview-${index}`}>
                        {uploadResult.column_names.map((header) => (
                          <td key={`preview-${index}-${header}`}>{row[header] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 2: Required Mapping</h2>
          <p className={styles.helper}>Map both required fields before continuing.</p>

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
                    {(uploadResult?.column_names ?? []).map((column) => (
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

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => setStep(0)}>
              Back
            </Button>
            <Button
              type="button"
              onPress={() => advanceStep(2)}
              isDisabled={requiredMissing.length > 0 || duplicateMappedHeaders.length > 0}
            >
              Continue to optional mapping
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 3: Optional Mapping</h2>
          <p className={styles.helper}>
            Map what you have, or skip fields that are not in your sheet.
          </p>

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
                    {(uploadResult?.column_names ?? []).map((column) => (
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
                {field.key === 'price_unit' && hasUnsupportedPriceUnitSelection ? (
                  <>
                    <p className={styles.warning}>
                      This column contains custom values ({unsupportedPriceUnitSamples.join(' • ')}
                      ). Price Unit only supports `flat`, `per_person`, or `per_unit`.
                    </p>
                    <p className={styles.helperSmall}>
                      Clear this mapping and classify that column in Step 4 as Size/Option if it
                      represents choices like platter, half pan, or whole pan.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onPress={() => setFieldMapping('price_unit', '')}
                    >
                      Clear Price Unit mapping
                    </Button>
                  </>
                ) : null}
              </div>
            );
          })}

          {duplicateMappedHeaders.length > 0 ? (
            <p className={styles.warning}>
              Duplicate mapped columns are not allowed: {duplicateMappedHeaders.join(', ')}.
            </p>
          ) : null}
          {hasUnsupportedPriceUnitSelection ? (
            <p className={styles.warning}>
              Clear Price Unit mapping before continuing, or use a column with valid enum values.
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              onPress={() => {
                setActiveRemainingIndex(0);
                advanceStep(3);
              }}
              isDisabled={duplicateMappedHeaders.length > 0 || hasUnsupportedPriceUnitSelection}
            >
              Continue to remaining columns
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 4: Remaining Columns</h2>
          <p className={styles.helper}>
            Decide how each unmapped column should be handled. Use quick buttons or drag cards
            between buckets.
          </p>
          <div className={styles.mappingGuide}>
            <p className={styles.mappingGuideTitle}>Size/Option vs Customization</p>
            <p className={styles.mappingGuideText}>
              <strong>Size/Option</strong> is a required choice that defines the item version, like
              Size (Small/Large) or Protein (Chicken/Steak).
            </p>
            <p className={styles.mappingGuideText}>
              <strong>Customization</strong> is an optional add/remove tweak reused across items,
              like No Onions, Extra Dressing, or Gluten-Free Bread.
            </p>
          </div>
          <div className={styles.proceedTop}>
            <Button
              type="button"
              onPress={() => void runValidation(true)}
              isDisabled={!canRunValidation || validating}
            >
              {validating ? 'Validating...' : 'Proceed to preview'}
            </Button>
          </div>

          {remainingColumns.length === 0 ? (
            <p className={styles.muted}>No unmapped columns remain.</p>
          ) : (
            <div className={styles.remainingCarousel}>
              <div className={styles.remainingCarouselHeader}>
                <p className={styles.remainingProgressText}>
                  {remainingCompletionCount}/{remainingColumns.length} complete
                </p>
                <ProgressBar
                  aria-label="Remaining columns completion"
                  className={styles.remainingProgress}
                  minValue={0}
                  maxValue={remainingColumns.length}
                  value={remainingCompletionCount}
                  valueLabel={`${remainingCompletionCount}/${remainingColumns.length} complete`}
                >
                  {({ percentage }) => (
                    <div className={styles.remainingProgressTrack}>
                      <div
                        className={styles.remainingProgressFill}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  )}
                </ProgressBar>
              </div>

              <div className={styles.remainingRail}>
                {remainingColumns.map((column, index) => {
                  const complete = isColumnActionComplete(column);
                  return (
                    <Button
                      key={column}
                      type="button"
                      size="sm"
                      variant="outline"
                      className={styles.remainingRailItem}
                      data-active={index === safeRemainingIndex}
                      data-complete={complete}
                      onPress={() => setActiveRemainingIndex(index)}
                    >
                      <span>{index + 1}</span>
                      <span>{column}</span>
                    </Button>
                  );
                })}
              </div>

              {activeRemainingColumn && activeRemainingConfig ? (
                <div className={styles.remainingCard}>
                  <div className={styles.remainingCardNav}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onPress={() => setActiveRemainingIndex((i) => Math.max(0, i - 1))}
                      isDisabled={safeRemainingIndex <= 0}
                    >
                      Previous
                    </Button>
                    <p className={styles.remainingCardIndex}>
                      Column {safeRemainingIndex + 1} of {remainingColumns.length}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onPress={() =>
                        setActiveRemainingIndex((i) => Math.min(remainingColumns.length - 1, i + 1))
                      }
                      isDisabled={safeRemainingIndex >= remainingColumns.length - 1}
                    >
                      Next
                    </Button>
                  </div>

                  <p className={styles.cardTitle}>{activeRemainingColumn}</p>
                  {activeRemainingSamples.length > 0 ? (
                    <p className={styles.muted}>Sample: {activeRemainingSamples.join(' • ')}</p>
                  ) : (
                    <p className={styles.muted}>No sample values found in preview rows.</p>
                  )}
                  <div
                    className={styles.modeOptions}
                    role="group"
                    aria-label={`Column mapping mode for ${activeRemainingColumn}`}
                  >
                    {MODE_OPTIONS.map((option) => (
                      <Button
                        key={option.mode}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={styles.modeOption}
                        data-selected={activeRemainingConfig.mode === option.mode}
                        onPress={() => setActiveColumnMode(option.mode)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <p className={styles.helperSmall}>
                    Choosing Size/Option, Customization, or Skip automatically advances to the next
                    column.
                  </p>
                  {activeRemainingConfig.mode !== 'skip' &&
                  activeRemainingConfig.mode !== 'unassigned' ? (
                    <label className={styles.inputLabel}>
                      Group name
                      <input
                        type="text"
                        value={activeRemainingConfig.groupName}
                        className={styles.inputControl}
                        onChange={(event) =>
                          setColumnAction(activeRemainingColumn, { groupName: event.target.value })
                        }
                        placeholder={activeRemainingColumn}
                      />
                    </label>
                  ) : null}
                  {activeRemainingConfig.mode === 'modifier' ? (
                    <p className={styles.muted}>
                      {activeRemainingModifierExists === undefined
                        ? 'Group status will appear after validation.'
                        : activeRemainingModifierExists
                          ? 'Will reuse existing customization group.'
                          : 'Will create a new customization group.'}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.partitionSection}>
                <p className={styles.partitionHelp}>
                  Drag and drop columns to repartition quickly.
                </p>
                <PartitionBoard
                  buckets={PARTITION_BUCKETS}
                  items={partitionItems}
                  activeItemId={activeRemainingColumn ?? undefined}
                  className={styles.partitionBoard}
                  onMoveItem={handleMoveRemainingColumn}
                  onItemPress={(column) => {
                    const index = remainingColumns.indexOf(column);
                    if (index >= 0) {
                      setActiveRemainingIndex(index);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {remainingDecisionPendingCount > 0 ? (
            <p className={styles.warning}>
              Choose an action for each remaining column before continuing.
            </p>
          ) : null}

          {validationError ? (
            <p className={styles.error} role="alert">
              {validationError}
            </p>
          ) : null}
          {mappingResult ? (
            <p className={mappingResult.row_errors.length > 0 ? styles.warning : styles.success}>
              Validation complete. {mappingResult.row_errors.length} row(s) need attention.
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => setStep(2)}>
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onPress={() => void runValidation(false)}
              isDisabled={!canRunValidation || validating}
            >
              {validating ? 'Checking...' : 'Check customization groups'}
            </Button>
            <Button
              type="button"
              onPress={() => void runValidation(true)}
              isDisabled={!canRunValidation || validating}
            >
              {validating ? 'Validating...' : 'Proceed to preview'}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Step 5: Preview &amp; Confirm</h2>
          <p className={styles.helper}>
            Review row-level issues before committing. You can go back to any earlier step.
          </p>

          {mappingResult ? (
            <>
              <div className={styles.summaryRow}>
                <span>{mappingResult.validated_preview.length} preview row(s)</span>
                <span>{mappingResult.row_errors.length} row(s) with issues</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Status</th>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Variants</th>
                      <th>Customizations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingResult.validated_preview.map((row) => {
                      const rowIssues = rowErrorsByRow.get(row.row) ?? [];
                      const status = rowIssues.length > 0 ? 'Issue' : 'Ready';
                      return (
                        <tr key={`validated-${row.row}`} data-has-errors={rowIssues.length > 0}>
                          <td>{row.row}</td>
                          <td>{status}</td>
                          <td>{row.name ?? 'Missing'}</td>
                          <td>{formatPrice(row.price, row.price_unit)}</td>
                          <td>{row.category ?? 'Uncategorized'}</td>
                          <td>{row.description ?? '—'}</td>
                          <td>
                            {row.variants
                              ? Object.entries(row.variants)
                                  .map(([group, option]) => `${group}: ${option}`)
                                  .join(' • ')
                              : '—'}
                          </td>
                          <td>
                            {row.modifiers
                              ? Object.entries(row.modifiers)
                                  .map(([group, option]) => `${group}: ${option}`)
                                  .join(' • ')
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className={styles.warning}>
              No validated preview is available yet. Re-run validation from Step 4.
            </p>
          )}

          {hasBlockingValidationErrors ? (
            <div className={styles.issueBlock}>
              <h3 className={styles.issueTitle}>Rows that need fixes</h3>
              <ul className={styles.issueList}>
                {mappingResult?.row_errors.map((rowError) => (
                  <li key={`issue-${rowError.row}`}>
                    Row {rowError.row}: {rowError.errors.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {commitError ? (
            <p className={styles.error} role="alert">
              {commitError}
            </p>
          ) : null}
          {commitSummary ? (
            <div className={styles.commitSummary}>
              <p className={styles.muted}>
                Created: {commitSummary.created_count} • Updated: {commitSummary.updated_count} •
                Errors: {commitSummary.error_count}
              </p>
              {commitSummary.errors.length > 0 ? (
                <ul className={styles.issueList}>
                  {commitSummary.errors.map((error, index) => (
                    <li key={`commit-error-${index}`}>
                      {typeof error.row === 'number' ? `Row ${error.row}: ` : ''}
                      {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onPress={() => setStep(3)}>
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onPress={() => void runValidation(false)}
              isDisabled={!canRunValidation || validating}
            >
              {validating ? 'Refreshing...' : 'Refresh preview'}
            </Button>
            <Button type="button" onPress={handleCommit} isDisabled={!canCommit}>
              {committing ? 'Importing...' : 'Confirm import'}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Import complete</h2>
          <p className={styles.helper}>
            Your menu import is done. You can review items now or run another file.
          </p>
          <p className={styles.success}>
            Created {commitSummary?.created_count ?? 0} item(s), updated{' '}
            {commitSummary?.updated_count ?? 0} item(s).
          </p>
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
