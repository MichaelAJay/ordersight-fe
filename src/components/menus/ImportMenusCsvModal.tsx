import { useMemo, useState, type ChangeEvent } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/common/Button/Button';
import modalStyles from '@/components/common/Modal/Modal.module.css';
import { HttpError } from '@/services/http';
import {
  commitMenuImportCSV,
  mapMenuImportCSV,
  uploadMenuImportCSV,
  type MenuImportCommitSummary,
  type MenuImportMappingRequest,
  type MenuImportMappingValidationResult,
  type MenuImportUploadResponse,
} from '@/services/menuImport';
import styles from './MenuModalStub.module.css';

type ImportMenusCsvModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type MappingKey = 'name' | 'price' | 'description' | 'category' | 'price_unit';
type ColumnMode = 'skip' | 'variant' | 'modifier';

type ColumnAction = {
  mode: ColumnMode;
  groupName: string;
};

const FIELD_CONFIG: Array<{
  key: MappingKey;
  label: string;
  required: boolean;
  suggestions: string[];
}> = [
  { key: 'name', label: 'Item Name', required: true, suggestions: ['name', 'item', 'item name'] },
  { key: 'price', label: 'Price', required: true, suggestions: ['price', 'cost', 'item price'] },
  {
    key: 'description',
    label: 'Description',
    required: false,
    suggestions: ['description', 'details', 'item description'],
  },
  {
    key: 'category',
    label: 'Category',
    required: false,
    suggestions: ['category', 'section', 'type'],
  },
  {
    key: 'price_unit',
    label: 'Price Unit',
    required: false,
    suggestions: ['price unit', 'unit', 'pricing unit'],
  },
];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string) {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  return detailsMessage ?? httpError?.message ?? fallback;
}

function autoMapHeaders(columns: string[]): Record<MappingKey, string> {
  const mapped = {
    name: '',
    price: '',
    description: '',
    category: '',
    price_unit: '',
  } satisfies Record<MappingKey, string>;

  const used = new Set<string>();
  for (const field of FIELD_CONFIG) {
    for (const column of columns) {
      if (used.has(column)) {
        continue;
      }
      const normalizedColumn = normalizeKey(column);
      if (
        field.suggestions.some((suggestion) => normalizedColumn.includes(normalizeKey(suggestion)))
      ) {
        mapped[field.key] = column;
        used.add(column);
        break;
      }
    }
  }

  return mapped;
}

function normalizeFieldMappings(
  raw: Partial<Record<MappingKey, string>>,
): Record<MappingKey, string> {
  return {
    name: raw.name ?? '',
    price: raw.price ?? '',
    description: raw.description ?? '',
    category: raw.category ?? '',
    price_unit: raw.price_unit ?? '',
  };
}

export function ImportMenusCsvModal({ isOpen, onOpenChange }: ImportMenusCsvModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<MenuImportUploadResponse | null>(null);

  const [fieldMappings, setFieldMappings] = useState<Record<MappingKey, string>>({
    name: '',
    price: '',
    description: '',
    category: '',
    price_unit: '',
  });
  const [columnActions, setColumnActions] = useState<Record<string, ColumnAction>>({});

  const [validating, setValidating] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingResult, setMappingResult] = useState<MenuImportMappingValidationResult | null>(
    null,
  );

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<MenuImportCommitSummary | null>(null);

  const allMappedHeaders = useMemo(
    () => Object.values(fieldMappings).filter((value) => value.trim().length > 0),
    [fieldMappings],
  );

  const unmappedColumns = useMemo(() => {
    const columnSet = new Set(allMappedHeaders);
    return (uploadResult?.column_names ?? []).filter((column) => !columnSet.has(column));
  }, [allMappedHeaders, uploadResult?.column_names]);

  const requiredMissing = useMemo(
    () =>
      FIELD_CONFIG.filter((field) => field.required).filter(
        (field) => !fieldMappings[field.key].trim(),
      ),
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

  const canValidate =
    Boolean(uploadResult?.import_session_id) &&
    requiredMissing.length === 0 &&
    duplicateMappedHeaders.length === 0;

  const canCommit = canValidate && mappingResult !== null && mappingResult.row_errors.length === 0;

  const setFieldMapping = (key: MappingKey, header: string) => {
    setFieldMappings((previous) => ({ ...previous, [key]: header }));
    setMappingResult(null);
    setCommitSummary(null);
  };

  const setColumnAction = (column: string, update: Partial<ColumnAction>) => {
    setColumnActions((previous) => {
      const current = previous[column] ?? { mode: 'skip', groupName: column };
      return {
        ...previous,
        [column]: {
          ...current,
          ...update,
        },
      };
    });
    setMappingResult(null);
    setCommitSummary(null);
  };

  const resetState = () => {
    setSelectedFile(null);
    setUploading(false);
    setUploadError(null);
    setUploadResult(null);
    setFieldMappings({
      name: '',
      price: '',
      description: '',
      category: '',
      price_unit: '',
    });
    setColumnActions({});
    setValidating(false);
    setMappingError(null);
    setMappingResult(null);
    setCommitting(false);
    setCommitError(null);
    setCommitSummary(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Select a CSV file to upload.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setMappingError(null);
    setCommitError(null);
    setCommitSummary(null);
    setMappingResult(null);

    try {
      const result = await uploadMenuImportCSV(selectedFile);
      setUploadResult(result);
      const autoMapped = autoMapHeaders(result.column_names);
      setFieldMappings(normalizeFieldMappings(autoMapped));

      const nextActions: Record<string, ColumnAction> = {};
      const mappedSet = new Set(Object.values(autoMapped).filter((value) => value));
      for (const column of result.column_names) {
        if (!mappedSet.has(column)) {
          nextActions[column] = { mode: 'skip', groupName: column };
        }
      }
      setColumnActions(nextActions);
    } catch (error) {
      setUploadError(getErrorMessage(error, 'Unable to upload CSV file.'));
    } finally {
      setUploading(false);
    }
  };

  const buildMappingPayload = (): MenuImportMappingRequest | null => {
    if (!uploadResult?.import_session_id) {
      return null;
    }
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

    const variants: MenuImportMappingRequest['variants'] = [];
    const modifiers: MenuImportMappingRequest['modifiers'] = [];

    for (const column of unmappedColumns) {
      const config = columnActions[column] ?? { mode: 'skip', groupName: column };
      if (config.mode === 'variant') {
        variants.push({ column, group_name: config.groupName.trim() || column });
      }
      if (config.mode === 'modifier') {
        modifiers.push({ column, group_name: config.groupName.trim() || column });
      }
    }

    return {
      required,
      optional: Object.keys(optional).length > 0 ? optional : undefined,
      variants: variants.length > 0 ? variants : undefined,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
    };
  };

  const handleValidate = async () => {
    if (!uploadResult?.import_session_id) {
      setMappingError('Upload a CSV before validating mapping.');
      return;
    }
    const payload = buildMappingPayload();
    if (!payload) {
      setMappingError('Map the required fields before validation.');
      return;
    }

    setValidating(true);
    setMappingError(null);
    setCommitError(null);
    setCommitSummary(null);
    try {
      const result = await mapMenuImportCSV(uploadResult.import_session_id, payload);
      setMappingResult(result);
    } catch (error) {
      setMappingError(getErrorMessage(error, 'Unable to validate mapping.'));
    } finally {
      setValidating(false);
    }
  };

  const handleCommit = async () => {
    if (!uploadResult?.import_session_id) {
      setCommitError('Upload and validate your CSV before committing.');
      return;
    }
    if (!canCommit) {
      setCommitError('Resolve mapping validation issues before committing.');
      return;
    }

    setCommitting(true);
    setCommitError(null);
    try {
      const summary = await commitMenuImportCSV(uploadResult.import_session_id);
      setCommitSummary(summary);
    } catch (error) {
      setCommitError(getErrorMessage(error, 'Unable to commit import.'));
    } finally {
      setCommitting(false);
    }
  };

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
  };

  const isHeaderUsedByOtherField = (column: string, field: MappingKey): boolean =>
    Object.entries(fieldMappings).some(
      ([fieldKey, mapped]) => fieldKey !== field && mapped === column,
    );

  return (
    <ModalOverlay
      isOpen={isOpen}
      className={modalStyles.overlay}
      isDismissable
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          resetState();
        }
      }}
    >
      <Modal className={modalStyles.dialog}>
        <Dialog>
          {({ close }) => (
            <>
              <div className={modalStyles.header}>
                <div>
                  <Heading slot="title" className={modalStyles.title}>
                    Import menu CSV
                  </Heading>
                  <p slot="description" className={modalStyles.description}>
                    Upload, map, validate, and commit your menu import.
                  </p>
                </div>
                <Button
                  type="button"
                  className={modalStyles.closeButton}
                  onPress={close}
                  aria-label="Close dialog"
                >
                  ×
                </Button>
              </div>

              <div className={modalStyles.body}>
                <p className={styles.note}>
                  This flow uses the API endpoints `/imports/csv/upload`,
                  `/imports/csv/:session_id/map`, and `/imports/csv/:session_id/commit`.
                </p>

                <div className={styles.contractGrid}>
                  <section className={styles.contractCard}>
                    <h3 className={styles.contractTitle}>1) Upload</h3>
                    <p className={styles.contractVersion}>Select a CSV file up to 5MB.</p>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileSelected}
                      className={styles.fileInput}
                    />
                    {selectedFile ? (
                      <p className={styles.hint}>Selected: {selectedFile.name}</p>
                    ) : null}
                    {uploadError ? (
                      <p className={styles.error} role="alert">
                        {uploadError}
                      </p>
                    ) : null}
                    <div className={styles.inlineActions}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onPress={handleUpload}
                        isDisabled={!selectedFile || uploading}
                      >
                        {uploading ? 'Uploading...' : 'Upload CSV'}
                      </Button>
                    </div>
                    {uploadResult ? (
                      <p className={styles.success}>
                        Uploaded {uploadResult.total_row_count} rows across{' '}
                        {uploadResult.column_names.length} columns.
                      </p>
                    ) : null}
                  </section>

                  <section className={styles.contractCard}>
                    <h3 className={styles.contractTitle}>2) Map Columns</h3>
                    {FIELD_CONFIG.map((field) => (
                      <div key={field.key} className={styles.mappingRow}>
                        <div className={styles.mappingMeta}>
                          <p className={styles.contractLabel}>
                            {field.label}
                            {field.required ? ' (required)' : ' (optional)'}
                          </p>
                        </div>
                        <select
                          value={fieldMappings[field.key]}
                          onChange={(event) => setFieldMapping(field.key, event.target.value)}
                          className={styles.selectControl}
                          disabled={!uploadResult}
                        >
                          <option value="">
                            {field.required ? 'Select column...' : 'Leave unmapped'}
                          </option>
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
                      </div>
                    ))}

                    {requiredMissing.length > 0 ? (
                      <p className={styles.warning}>
                        Missing required mappings:{' '}
                        {requiredMissing.map((field) => field.label).join(', ')}.
                      </p>
                    ) : null}
                    {duplicateMappedHeaders.length > 0 ? (
                      <p className={styles.warning}>
                        Duplicate mapped columns: {duplicateMappedHeaders.join(', ')}.
                      </p>
                    ) : null}
                  </section>

                  <section className={styles.contractCard}>
                    <h3 className={styles.contractTitle}>3) Remaining Columns</h3>
                    {unmappedColumns.length === 0 ? (
                      <p className={styles.hint}>No remaining columns.</p>
                    ) : null}
                    {unmappedColumns.map((column) => {
                      const action = columnActions[column] ?? { mode: 'skip', groupName: column };
                      return (
                        <div key={`column-${column}`} className={styles.mappingRow}>
                          <p className={styles.contractLabel}>{column}</p>
                          <select
                            value={action.mode}
                            onChange={(event) =>
                              setColumnAction(column, { mode: event.target.value as ColumnMode })
                            }
                            className={styles.selectControl}
                          >
                            <option value="skip">Skip</option>
                            <option value="variant">Variant</option>
                            <option value="modifier">Modifier</option>
                          </select>
                          {action.mode !== 'skip' ? (
                            <input
                              type="text"
                              value={action.groupName}
                              onChange={(event) =>
                                setColumnAction(column, { groupName: event.target.value })
                              }
                              className={styles.inputControl}
                              placeholder="Group name"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </section>

                  <section className={styles.contractCard}>
                    <h3 className={styles.contractTitle}>4) Validate &amp; Commit</h3>
                    <div className={styles.inlineActions}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onPress={handleValidate}
                        isDisabled={!canValidate || validating}
                      >
                        {validating ? 'Validating...' : 'Validate mapping'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onPress={handleCommit}
                        isDisabled={!canCommit || committing}
                      >
                        {committing ? 'Committing...' : 'Commit import'}
                      </Button>
                    </div>

                    {mappingError ? (
                      <p className={styles.error} role="alert">
                        {mappingError}
                      </p>
                    ) : null}
                    {mappingResult ? (
                      <p
                        className={
                          mappingResult.row_errors.length === 0 ? styles.success : styles.warning
                        }
                      >
                        Validation complete. {mappingResult.row_errors.length} row(s) with errors.
                      </p>
                    ) : null}
                    {commitError ? (
                      <p className={styles.error} role="alert">
                        {commitError}
                      </p>
                    ) : null}
                    {commitSummary ? (
                      <ul className={styles.fieldList}>
                        <li>Created: {commitSummary.created_count}</li>
                        <li>Updated: {commitSummary.updated_count}</li>
                        <li>Errors: {commitSummary.error_count}</li>
                      </ul>
                    ) : null}
                  </section>
                </div>
              </div>

              <div className={modalStyles.footer}>
                <Button type="button" variant="outline" onPress={resetState}>
                  Reset
                </Button>
                <Button type="button" variant="primary" onPress={close}>
                  Close
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
