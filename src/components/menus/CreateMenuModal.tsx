import { useMemo, useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/common/Button/Button';
import modalStyles from '@/components/common/Modal/Modal.module.css';
import { HttpError, postJSON } from '@/services/http';
import styles from './CreateMenuModal.module.css';

type CreateMenuModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

type StepKey = 'basics' | 'library' | 'items' | 'review';

type OptionDraft = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

type OptionGroupDraft = {
  id: string;
  name: string;
  uiHint: 'variant' | 'modifier' | 'addon';
  options: OptionDraft[];
};

type VariantAttachmentDraft = {
  id: string;
  groupId: string;
  minSelect: number;
  maxSelect: number;
  allowMode: 'all' | 'custom';
  allowedOptionIds: string[];
};

type VariantDraft = {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  isActive: boolean;
  attachments: VariantAttachmentDraft[];
};

type ItemFamilyDraft = {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  variants: VariantDraft[];
};

const steps: Array<{ key: StepKey; label: string; helper: string }> = [
  { key: 'basics', label: 'Menu Basics', helper: 'Name and category structure.' },
  { key: 'library', label: 'Shared Choices', helper: 'Create reusable choice groups.' },
  { key: 'items', label: 'Items & Variants', helper: 'Variant rules and option filtering.' },
  { key: 'review', label: 'Review', helper: 'Check the generated plan.' },
];

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createOptionDraft(): OptionDraft {
  return {
    id: createId('opt'),
    name: '',
    priceDeltaCents: 0,
  };
}

function createOptionGroupDraft(): OptionGroupDraft {
  return {
    id: createId('group'),
    name: '',
    uiHint: 'modifier',
    options: [createOptionDraft()],
  };
}

function createAttachmentDraft(groupId = ''): VariantAttachmentDraft {
  return {
    id: createId('attach'),
    groupId,
    minSelect: 0,
    maxSelect: 1,
    allowMode: 'all',
    allowedOptionIds: [],
  };
}

function createVariantDraft(): VariantDraft {
  return {
    id: createId('variant'),
    name: '',
    sku: '',
    priceCents: 0,
    isActive: true,
    attachments: [],
  };
}

function createItemFamilyDraft(): ItemFamilyDraft {
  return {
    id: createId('item'),
    name: '',
    description: '',
    categoryName: '',
    variants: [createVariantDraft()],
  };
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function toNonNegativeInteger(value: number): number {
  return value < 0 ? 0 : value;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const normalized = error as HttpError | Error | null;
  const httpError = normalized as HttpError;
  const detailsMessage = (httpError?.details as { message?: string } | undefined)?.message;
  const message = detailsMessage ?? httpError?.message ?? fallback;
  return message
    .replace(/^bad request:\s*/i, '')
    .replace(/:\s*bad request$/i, '')
    .replace(/:\s*conflict$/i, '');
}

export function CreateMenuModal({ isOpen, onOpenChange, onCreated }: CreateMenuModalProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [menuName, setMenuName] = useState('');
  const [menuNotes, setMenuNotes] = useState('');
  const [categoriesInput, setCategoriesInput] = useState('Main, Sides, Drinks');
  const [optionGroups, setOptionGroups] = useState<OptionGroupDraft[]>([]);
  const [itemFamilies, setItemFamilies] = useState<ItemFamilyDraft[]>([]);
  const [showErrorsByStep, setShowErrorsByStep] = useState<Record<StepKey, boolean>>({
    basics: false,
    library: false,
    items: false,
    review: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentStep = steps[Math.min(activeStepIndex, steps.length - 1)]!;

  const parsedCategories = useMemo(() => {
    const raw = categoriesInput
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return dedupe(raw);
  }, [categoriesInput]);

  const validOptionGroups = useMemo(
    () =>
      optionGroups.map((group) => ({
        ...group,
        name: group.name.trim(),
        options: group.options.filter((option) => option.name.trim().length > 0),
      })),
    [optionGroups],
  );

  const attachableOptionGroups = useMemo(
    () => validOptionGroups.filter((group) => group.name.length > 0),
    [validOptionGroups],
  );

  const optionLookup = useMemo(() => {
    const byGroup = new Map<string, OptionDraft[]>();
    for (const group of attachableOptionGroups) {
      byGroup.set(group.id, group.options);
    }
    return byGroup;
  }, [attachableOptionGroups]);

  const stepErrors = useMemo<Record<StepKey, string[]>>(() => {
    const errors: Record<StepKey, string[]> = {
      basics: [],
      library: [],
      items: [],
      review: [],
    };

    if (menuName.trim().length === 0) {
      errors.basics.push('Menu name is required.');
    }
    optionGroups.forEach((group) => {
      const namedOptions = group.options.filter((option) => option.name.trim().length > 0);
      if (group.name.trim().length === 0 && namedOptions.length > 0) {
        errors.library.push('If a group has options, it must have a group name.');
      }
    });

    itemFamilies.forEach((family) => {
      family.variants.forEach((variant) => {
        const variantHasData =
          variant.name.trim().length > 0 ||
          variant.sku.trim().length > 0 ||
          variant.priceCents > 0 ||
          variant.attachments.length > 0;

        if (variantHasData && variant.name.trim().length === 0) {
          errors.items.push(
            `Variant names are required in item "${family.name || 'Untitled item'}".`,
          );
        }
        if (variant.priceCents < 0) {
          errors.items.push('Variant price must be zero or greater.');
        }

        variant.attachments.forEach((attachment) => {
          if (!attachment.groupId) {
            errors.items.push(
              `Pick an option group for each attachment in "${family.name || 'Untitled item'} / ${variant.name || 'Untitled variant'}".`,
            );
            return;
          }

          if (attachment.maxSelect < attachment.minSelect) {
            errors.items.push(
              `Selection rule mismatch in "${variant.name || 'Untitled variant'}": max cannot be less than min.`,
            );
          }

          const options = optionLookup.get(attachment.groupId) ?? [];
          if (options.length === 0) {
            errors.items.push(
              `Group attachments in "${variant.name || 'Untitled variant'}" need option values in the selected group.`,
            );
            return;
          }

          if (attachment.allowMode === 'custom') {
            const allowed = attachment.allowedOptionIds.filter((id) =>
              options.some((option) => option.id === id),
            );
            if (allowed.length === 0) {
              errors.items.push(
                `Custom allowlist in "${variant.name || 'Untitled variant'}" must include at least one option.`,
              );
            }
            if (allowed.length < attachment.maxSelect) {
              errors.items.push(
                `Custom allowlist in "${variant.name || 'Untitled variant'}" must have at least max-select options.`,
              );
            }
          } else if (options.length < attachment.maxSelect) {
            errors.items.push(
              `Group "${attachment.groupId}" in "${variant.name || 'Untitled variant'}" has fewer options than max-select.`,
            );
          }
        });
      });
    });

    errors.review = [...errors.basics, ...errors.library, ...errors.items];

    return errors;
  }, [menuName, optionGroups, itemFamilies, optionLookup]);

  const currentStepErrors = showErrorsByStep[currentStep.key] ? stepErrors[currentStep.key] : [];

  const totals = useMemo(() => {
    const variantCount = itemFamilies.reduce((count, family) => count + family.variants.length, 0);
    const attachmentCount = itemFamilies.reduce(
      (count, family) =>
        count + family.variants.reduce((inner, variant) => inner + variant.attachments.length, 0),
      0,
    );
    const customAllowlistRows = itemFamilies.reduce(
      (count, family) =>
        count +
        family.variants.reduce(
          (inner, variant) =>
            inner +
            variant.attachments.reduce((rows, attachment) => {
              if (attachment.allowMode !== 'custom' || !attachment.groupId) {
                return rows;
              }
              const optionCount = dedupe(attachment.allowedOptionIds).length;
              return rows + optionCount;
            }, 0),
          0,
        ),
      0,
    );

    return {
      variantCount,
      attachmentCount,
      customAllowlistRows,
      optionCount: attachableOptionGroups.reduce((count, group) => count + group.options.length, 0),
    };
  }, [itemFamilies, attachableOptionGroups]);

  const createPayload = useMemo(() => {
    return {
      menu: {
        name: menuName.trim(),
        notes: menuNotes.trim() || null,
      },
      categories: parsedCategories,
      option_groups: attachableOptionGroups.map((group) => ({
        client_ref: group.id,
        name: group.name.trim(),
        ui_hint: group.uiHint,
        options: group.options.map((option) => ({
          client_ref: option.id,
          name: option.name.trim(),
          price_delta_cents: option.priceDeltaCents,
        })),
      })),
      items: itemFamilies.map((family) => ({
        family_name: family.name.trim(),
        description: family.description.trim() || null,
        category_name: family.categoryName.trim() || null,
        variants: family.variants.map((variant) => ({
          name: variant.name.trim(),
          sku: variant.sku.trim() || null,
          base_price_cents: variant.priceCents,
          is_active: variant.isActive,
          option_group_rules: variant.attachments
            .filter((attachment) => attachment.groupId)
            .map((attachment) => {
              const groupOptions = optionLookup.get(attachment.groupId) ?? [];
              const allowedOptionIds =
                attachment.allowMode === 'custom'
                  ? dedupe(attachment.allowedOptionIds).filter((id) =>
                      groupOptions.some((option) => option.id === id),
                    )
                  : null;

              return {
                option_group_id: attachment.groupId,
                min_select: attachment.minSelect,
                max_select: attachment.maxSelect,
                allow_mode: attachment.allowMode,
                allowed_option_ids: allowedOptionIds,
              };
            }),
        })),
      })),
    };
  }, [menuName, menuNotes, parsedCategories, attachableOptionGroups, itemFamilies, optionLookup]);

  const reviewPayload = useMemo(() => {
    return {
      ...createPayload,
      derived_counts: {
        menu_items: totals.variantCount,
        menu_item_in_menu_rows: totals.variantCount,
        option_group_on_item_rows: totals.attachmentCount,
        option_on_item_group_rows_if_custom: totals.customAllowlistRows,
      },
    };
  }, [createPayload, totals.variantCount, totals.attachmentCount, totals.customAllowlistRows]);

  const canMoveBack = activeStepIndex > 0;
  const canMoveNext = activeStepIndex < steps.length - 1;
  const canAdvance = stepErrors[currentStep.key].length === 0;

  const setFamilyValue = (
    familyId: string,
    updater: (family: ItemFamilyDraft) => ItemFamilyDraft,
  ) => {
    setItemFamilies((previous) =>
      previous.map((family) => (family.id === familyId ? updater(family) : family)),
    );
  };

  const setVariantValue = (
    familyId: string,
    variantId: string,
    updater: (variant: VariantDraft) => VariantDraft,
  ) => {
    setFamilyValue(familyId, (family) => ({
      ...family,
      variants: family.variants.map((variant) =>
        variant.id === variantId ? updater(variant) : variant,
      ),
    }));
  };

  const setAttachmentValue = (
    familyId: string,
    variantId: string,
    attachmentId: string,
    updater: (attachment: VariantAttachmentDraft) => VariantAttachmentDraft,
  ) => {
    setVariantValue(familyId, variantId, (variant) => ({
      ...variant,
      attachments: variant.attachments.map((attachment) =>
        attachment.id === attachmentId ? updater(attachment) : attachment,
      ),
    }));
  };

  const addOptionGroup = () => {
    setOptionGroups((previous) => [...previous, createOptionGroupDraft()]);
  };

  const removeOptionGroup = (groupId: string) => {
    setOptionGroups((previous) => previous.filter((group) => group.id !== groupId));
    setItemFamilies((previous) =>
      previous.map((family) => ({
        ...family,
        variants: family.variants.map((variant) => ({
          ...variant,
          attachments: variant.attachments.filter((attachment) => attachment.groupId !== groupId),
        })),
      })),
    );
  };

  const addFamily = () => {
    setItemFamilies((previous) => [...previous, createItemFamilyDraft()]);
  };

  const removeFamily = (familyId: string) => {
    setItemFamilies((previous) => previous.filter((family) => family.id !== familyId));
  };

  const addVariant = (familyId: string) => {
    setFamilyValue(familyId, (family) => ({
      ...family,
      variants: [...family.variants, createVariantDraft()],
    }));
  };

  const removeVariant = (familyId: string, variantId: string) => {
    setFamilyValue(familyId, (family) => ({
      ...family,
      variants: family.variants.filter((variant) => variant.id !== variantId),
    }));
  };

  const addAttachment = (familyId: string, variantId: string) => {
    const firstGroup = attachableOptionGroups[0];
    setVariantValue(familyId, variantId, (variant) => ({
      ...variant,
      attachments: [...variant.attachments, createAttachmentDraft(firstGroup?.id ?? '')],
    }));
  };

  const removeAttachment = (familyId: string, variantId: string, attachmentId: string) => {
    setVariantValue(familyId, variantId, (variant) => ({
      ...variant,
      attachments: variant.attachments.filter((attachment) => attachment.id !== attachmentId),
    }));
  };

  const resetWizard = () => {
    setActiveStepIndex(0);
    setMenuName('');
    setMenuNotes('');
    setCategoriesInput('Main, Sides, Drinks');
    setOptionGroups([]);
    setItemFamilies([]);
    setShowErrorsByStep({
      basics: false,
      library: false,
      items: false,
      review: false,
    });
    setSubmitError(null);
    setIsSubmitting(false);
  };

  return (
    <ModalOverlay
      isOpen={isOpen}
      className={modalStyles.overlay}
      isDismissable
      onOpenChange={onOpenChange}
    >
      <Modal className={`${modalStyles.dialog} ${styles.wizardDialog}`}>
        <Dialog className={styles.wizardContent}>
          {({ close }) => (
            <>
              <div className={modalStyles.header}>
                <div>
                  <Heading slot="title" className={modalStyles.title}>
                    Create menu
                  </Heading>
                  <p slot="description" className={modalStyles.description}>
                    Build a menu with reusable option groups and variant-level rules.
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

              <div className={`${modalStyles.body} ${styles.wizardBody}`}>
                <ol className={styles.stepRail}>
                  {steps.map((step, index) => {
                    const isActive = index === activeStepIndex;
                    const isDone = index < activeStepIndex;
                    return (
                      <li
                        key={step.key}
                        className={`${styles.stepItem} ${isActive ? styles.stepActive : ''} ${
                          isDone ? styles.stepDone : ''
                        }`}
                      >
                        <button
                          type="button"
                          className={styles.stepButton}
                          onClick={() => setActiveStepIndex(index)}
                        >
                          <span className={styles.stepNumber}>{index + 1}</span>
                          <span>
                            <span className={styles.stepLabel}>{step.label}</span>
                            <span className={styles.stepHelper}>{step.helper}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>

                {currentStep.key === 'basics' ? (
                  <section className={styles.panel}>
                    <h3 className={styles.panelTitle}>Menu Basics</h3>
                    <p className={styles.panelHint}>
                      Start with the high-level structure. You can refine items and variant rules in
                      the next steps.
                    </p>

                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Menu name</span>
                      <input
                        className={styles.input}
                        type="text"
                        value={menuName}
                        onChange={(event) => setMenuName(event.target.value)}
                        placeholder="Weekday Catering Menu"
                      />
                    </label>

                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Categories</span>
                      <textarea
                        className={styles.textarea}
                        value={categoriesInput}
                        onChange={(event) => setCategoriesInput(event.target.value)}
                        rows={4}
                        placeholder="Main, Sides, Drinks"
                      />
                    </label>

                    <div className={styles.chipWrap}>
                      {parsedCategories.map((category) => (
                        <span key={category} className={styles.chip}>
                          {category}
                        </span>
                      ))}
                    </div>

                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Internal notes (optional)</span>
                      <textarea
                        className={styles.textarea}
                        value={menuNotes}
                        onChange={(event) => setMenuNotes(event.target.value)}
                        rows={3}
                        placeholder="Seasonal launch, lunch-focused pricing..."
                      />
                    </label>
                  </section>
                ) : null}

                {currentStep.key === 'library' ? (
                  <section className={styles.panel}>
                    <div className={styles.panelHeaderRow}>
                      <div>
                        <h3 className={styles.panelTitle}>Shared Choices</h3>
                        <p className={styles.panelHint}>
                          Optional: create shared choice groups (for example proteins, sides, and
                          add-ons) once, then attach them to any item or variant.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onPress={addOptionGroup}>
                        Add Group
                      </Button>
                    </div>

                    <div className={styles.cardGrid}>
                      {optionGroups.map((group, index) => (
                        <article key={group.id} className={styles.card}>
                          <div className={styles.cardHeader}>
                            <h4 className={styles.cardTitle}>Group {index + 1}</h4>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onPress={() => removeOptionGroup(group.id)}
                            >
                              Remove
                            </Button>
                          </div>

                          <div className={styles.fieldRow}>
                            <label className={styles.fieldGroup}>
                              <span className={styles.fieldLabel}>Group name</span>
                              <input
                                className={styles.input}
                                type="text"
                                value={group.name}
                                onChange={(event) =>
                                  setOptionGroups((previous) =>
                                    previous.map((entry) =>
                                      entry.id === group.id
                                        ? { ...entry, name: event.target.value }
                                        : entry,
                                    ),
                                  )
                                }
                                placeholder="Protein"
                              />
                            </label>
                            <label className={styles.fieldGroup}>
                              <span className={styles.fieldLabel}>UI hint</span>
                              <select
                                className={styles.select}
                                value={group.uiHint}
                                onChange={(event) => {
                                  const value = event.target.value as OptionGroupDraft['uiHint'];
                                  setOptionGroups((previous) =>
                                    previous.map((entry) =>
                                      entry.id === group.id ? { ...entry, uiHint: value } : entry,
                                    ),
                                  );
                                }}
                              >
                                <option value="variant">Variant</option>
                                <option value="modifier">Modifier</option>
                                <option value="addon">Add-on</option>
                              </select>
                            </label>
                          </div>

                          <div className={styles.optionList}>
                            {group.options.map((option) => (
                              <div key={option.id} className={styles.optionRow}>
                                <input
                                  className={styles.input}
                                  type="text"
                                  value={option.name}
                                  onChange={(event) =>
                                    setOptionGroups((previous) =>
                                      previous.map((entry) =>
                                        entry.id === group.id
                                          ? {
                                              ...entry,
                                              options: entry.options.map((item) =>
                                                item.id === option.id
                                                  ? { ...item, name: event.target.value }
                                                  : item,
                                              ),
                                            }
                                          : entry,
                                      ),
                                    )
                                  }
                                  placeholder="Chicken"
                                />
                                <input
                                  className={styles.numberInput}
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={option.priceDeltaCents}
                                  onChange={(event) => {
                                    const parsed = parseInteger(
                                      event.target.value,
                                      option.priceDeltaCents,
                                    );
                                    setOptionGroups((previous) =>
                                      previous.map((entry) =>
                                        entry.id === group.id
                                          ? {
                                              ...entry,
                                              options: entry.options.map((item) =>
                                                item.id === option.id
                                                  ? {
                                                      ...item,
                                                      priceDeltaCents: toNonNegativeInteger(parsed),
                                                    }
                                                  : item,
                                              ),
                                            }
                                          : entry,
                                      ),
                                    );
                                  }}
                                  aria-label="Price delta in cents"
                                />
                                <span className={styles.pricePreview}>
                                  {formatCents(option.priceDeltaCents)}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onPress={() =>
                                    setOptionGroups((previous) =>
                                      previous.map((entry) =>
                                        entry.id === group.id
                                          ? {
                                              ...entry,
                                              options: entry.options.filter(
                                                (item) => item.id !== option.id,
                                              ),
                                            }
                                          : entry,
                                      ),
                                    )
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                          </div>

                          <div className={styles.inlineActions}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onPress={() =>
                                setOptionGroups((previous) =>
                                  previous.map((entry) =>
                                    entry.id === group.id
                                      ? {
                                          ...entry,
                                          options: [...entry.options, createOptionDraft()],
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              Add Option
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {currentStep.key === 'items' ? (
                  <section className={styles.panel}>
                    <div className={styles.panelHeaderRow}>
                      <div>
                        <h3 className={styles.panelTitle}>Items and Variants</h3>
                        <p className={styles.panelHint}>
                          Optional: model customer-facing variants with per-variant option-group
                          rules.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onPress={addFamily}>
                        Add Item
                      </Button>
                    </div>

                    <div className={styles.familyStack}>
                      {itemFamilies.map((family, familyIndex) => (
                        <article key={family.id} className={styles.familyCard}>
                          <div className={styles.cardHeader}>
                            <h4 className={styles.cardTitle}>Item {familyIndex + 1}</h4>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onPress={() => removeFamily(family.id)}
                            >
                              Remove Item
                            </Button>
                          </div>

                          <div className={styles.fieldRow}>
                            <label className={styles.fieldGroup}>
                              <span className={styles.fieldLabel}>Item name</span>
                              <input
                                className={styles.input}
                                type="text"
                                value={family.name}
                                onChange={(event) =>
                                  setFamilyValue(family.id, (current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                                placeholder="Wrap"
                              />
                            </label>
                            <label className={styles.fieldGroup}>
                              <span className={styles.fieldLabel}>Category</span>
                              <select
                                className={styles.select}
                                value={family.categoryName}
                                onChange={(event) =>
                                  setFamilyValue(family.id, (current) => ({
                                    ...current,
                                    categoryName: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Unassigned</option>
                                {parsedCategories.map((category) => (
                                  <option key={`${family.id}-${category}`} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Description</span>
                            <textarea
                              className={styles.textarea}
                              value={family.description}
                              onChange={(event) =>
                                setFamilyValue(family.id, (current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              rows={2}
                              placeholder="Freshly made and packed for group ordering"
                            />
                          </label>

                          <div className={styles.variantStack}>
                            {family.variants.map((variant, variantIndex) => (
                              <section key={variant.id} className={styles.variantCard}>
                                <div className={styles.cardHeader}>
                                  <h5 className={styles.variantTitle}>
                                    Variant {variantIndex + 1}
                                  </h5>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onPress={() => removeVariant(family.id, variant.id)}
                                  >
                                    Remove Variant
                                  </Button>
                                </div>

                                <div className={styles.fieldRow}>
                                  <label className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>Variant name</span>
                                    <input
                                      className={styles.input}
                                      type="text"
                                      value={variant.name}
                                      onChange={(event) =>
                                        setVariantValue(family.id, variant.id, (current) => ({
                                          ...current,
                                          name: event.target.value,
                                        }))
                                      }
                                      placeholder="Kosher"
                                    />
                                  </label>
                                  <label className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>SKU (optional)</span>
                                    <input
                                      className={styles.input}
                                      type="text"
                                      value={variant.sku}
                                      onChange={(event) =>
                                        setVariantValue(family.id, variant.id, (current) => ({
                                          ...current,
                                          sku: event.target.value,
                                        }))
                                      }
                                      placeholder="WRAP-KOSHER"
                                    />
                                  </label>
                                  <label className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>Base price (cents)</span>
                                    <input
                                      className={styles.numberInput}
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={variant.priceCents}
                                      onChange={(event) => {
                                        const parsed = parseInteger(
                                          event.target.value,
                                          variant.priceCents,
                                        );
                                        setVariantValue(family.id, variant.id, (current) => ({
                                          ...current,
                                          priceCents: toNonNegativeInteger(parsed),
                                        }));
                                      }}
                                    />
                                    <span className={styles.pricePreview}>
                                      {formatCents(variant.priceCents)}
                                    </span>
                                  </label>
                                </div>

                                <label className={styles.checkboxLine}>
                                  <input
                                    type="checkbox"
                                    checked={variant.isActive}
                                    onChange={(event) =>
                                      setVariantValue(family.id, variant.id, (current) => ({
                                        ...current,
                                        isActive: event.target.checked,
                                      }))
                                    }
                                  />
                                  Active variant
                                </label>

                                <div className={styles.attachmentSection}>
                                  <div className={styles.cardHeader}>
                                    <h6 className={styles.attachmentTitle}>Option-group rules</h6>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onPress={() => addAttachment(family.id, variant.id)}
                                      isDisabled={attachableOptionGroups.length === 0}
                                    >
                                      Attach Group
                                    </Button>
                                  </div>

                                  {variant.attachments.length === 0 ? (
                                    <p className={styles.emptyText}>
                                      No groups attached yet. Attach a group to control selection
                                      limits and allowed options for this variant.
                                    </p>
                                  ) : null}

                                  {variant.attachments.map((attachment) => {
                                    const group = attachableOptionGroups.find(
                                      (entry) => entry.id === attachment.groupId,
                                    );
                                    const groupOptions = group?.options ?? [];
                                    const selectedSet = new Set(attachment.allowedOptionIds);

                                    return (
                                      <div key={attachment.id} className={styles.attachmentCard}>
                                        <div className={styles.fieldRow}>
                                          <label className={styles.fieldGroup}>
                                            <span className={styles.fieldLabel}>Group</span>
                                            <select
                                              className={styles.select}
                                              value={attachment.groupId}
                                              onChange={(event) => {
                                                const nextGroupId = event.target.value;
                                                const nextGroup = attachableOptionGroups.find(
                                                  (entry) => entry.id === nextGroupId,
                                                );
                                                setAttachmentValue(
                                                  family.id,
                                                  variant.id,
                                                  attachment.id,
                                                  (current) => ({
                                                    ...current,
                                                    groupId: nextGroupId,
                                                    allowedOptionIds:
                                                      current.allowMode === 'custom'
                                                        ? (nextGroup?.options.map(
                                                            (option) => option.id,
                                                          ) ?? [])
                                                        : [],
                                                  }),
                                                );
                                              }}
                                            >
                                              <option value="">Select group...</option>
                                              {attachableOptionGroups.map((entry) => (
                                                <option key={entry.id} value={entry.id}>
                                                  {entry.name || 'Untitled group'}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          <label className={styles.fieldGroup}>
                                            <span className={styles.fieldLabel}>Min</span>
                                            <input
                                              className={styles.numberInput}
                                              type="number"
                                              min={0}
                                              step={1}
                                              value={attachment.minSelect}
                                              onChange={(event) => {
                                                const parsed = toNonNegativeInteger(
                                                  parseInteger(
                                                    event.target.value,
                                                    attachment.minSelect,
                                                  ),
                                                );
                                                setAttachmentValue(
                                                  family.id,
                                                  variant.id,
                                                  attachment.id,
                                                  (current) => ({
                                                    ...current,
                                                    minSelect: parsed,
                                                    maxSelect:
                                                      current.maxSelect < parsed
                                                        ? parsed
                                                        : current.maxSelect,
                                                  }),
                                                );
                                              }}
                                            />
                                          </label>
                                          <label className={styles.fieldGroup}>
                                            <span className={styles.fieldLabel}>Max</span>
                                            <input
                                              className={styles.numberInput}
                                              type="number"
                                              min={attachment.minSelect}
                                              step={1}
                                              value={attachment.maxSelect}
                                              onChange={(event) => {
                                                const parsed = toNonNegativeInteger(
                                                  parseInteger(
                                                    event.target.value,
                                                    attachment.maxSelect,
                                                  ),
                                                );
                                                setAttachmentValue(
                                                  family.id,
                                                  variant.id,
                                                  attachment.id,
                                                  (current) => ({
                                                    ...current,
                                                    maxSelect:
                                                      parsed < current.minSelect
                                                        ? current.minSelect
                                                        : parsed,
                                                  }),
                                                );
                                              }}
                                            />
                                          </label>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onPress={() =>
                                              removeAttachment(family.id, variant.id, attachment.id)
                                            }
                                          >
                                            Remove
                                          </Button>
                                        </div>

                                        <div className={styles.inlineActions}>
                                          <Button
                                            type="button"
                                            variant={
                                              attachment.allowMode === 'all' ? 'primary' : 'outline'
                                            }
                                            size="sm"
                                            onPress={() =>
                                              setAttachmentValue(
                                                family.id,
                                                variant.id,
                                                attachment.id,
                                                (current) => ({
                                                  ...current,
                                                  allowMode: 'all',
                                                }),
                                              )
                                            }
                                          >
                                            Use all options in group
                                          </Button>
                                          <Button
                                            type="button"
                                            variant={
                                              attachment.allowMode === 'custom'
                                                ? 'primary'
                                                : 'outline'
                                            }
                                            size="sm"
                                            onPress={() =>
                                              setAttachmentValue(
                                                family.id,
                                                variant.id,
                                                attachment.id,
                                                (current) => ({
                                                  ...current,
                                                  allowMode: 'custom',
                                                  allowedOptionIds:
                                                    current.allowedOptionIds.length > 0
                                                      ? current.allowedOptionIds
                                                      : groupOptions.map((option) => option.id),
                                                }),
                                              )
                                            }
                                            isDisabled={!group}
                                          >
                                            Custom allowlist
                                          </Button>
                                        </div>

                                        {attachment.allowMode === 'custom' && group ? (
                                          <div className={styles.checkboxGrid}>
                                            {groupOptions.map((option) => (
                                              <label
                                                key={option.id}
                                                className={styles.checkboxTile}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={selectedSet.has(option.id)}
                                                  onChange={(event) =>
                                                    setAttachmentValue(
                                                      family.id,
                                                      variant.id,
                                                      attachment.id,
                                                      (current) => {
                                                        const selection = new Set(
                                                          current.allowedOptionIds,
                                                        );
                                                        if (event.target.checked) {
                                                          selection.add(option.id);
                                                        } else {
                                                          selection.delete(option.id);
                                                        }
                                                        return {
                                                          ...current,
                                                          allowedOptionIds: Array.from(selection),
                                                        };
                                                      },
                                                    )
                                                  }
                                                />
                                                <span>
                                                  {option.name}
                                                  <small>
                                                    {formatCents(option.priceDeltaCents)}
                                                  </small>
                                                </span>
                                              </label>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </section>
                            ))}
                          </div>

                          <div className={styles.inlineActions}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onPress={() => addVariant(family.id)}
                            >
                              Add Variant
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {currentStep.key === 'review' ? (
                  <section className={styles.panel}>
                    <h3 className={styles.panelTitle}>Review Draft</h3>
                    <p className={styles.panelHint}>
                      This preview shows how your setup maps to the canonical tables.
                    </p>

                    <div className={styles.summaryGrid}>
                      <article className={styles.summaryCard}>
                        <h4>Menu scope</h4>
                        <ul>
                          <li>Menu name: {menuName.trim() || 'Missing'}</li>
                          <li>Categories: {parsedCategories.length}</li>
                          <li>Item families: {itemFamilies.length}</li>
                          <li>Variants: {totals.variantCount}</li>
                        </ul>
                      </article>
                      <article className={styles.summaryCard}>
                        <h4>Option model</h4>
                        <ul>
                          <li>Option groups: {optionGroups.length}</li>
                          <li>Options: {totals.optionCount}</li>
                          <li>Group attachments: {totals.attachmentCount}</li>
                          <li>Custom allowlist rows: {totals.customAllowlistRows}</li>
                        </ul>
                      </article>
                    </div>

                    <pre className={styles.payloadPreview}>
                      {JSON.stringify(reviewPayload, null, 2)}
                    </pre>
                  </section>
                ) : null}

                {currentStepErrors.length > 0 ? (
                  <div className={styles.errorBox} role="alert">
                    <p className={styles.errorTitle}>Fix before continuing:</p>
                    <ul>
                      {dedupe(currentStepErrors).map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {submitError ? (
                  <div className={styles.errorBox} role="alert">
                    <p className={styles.errorTitle}>{submitError}</p>
                  </div>
                ) : null}
              </div>

              <div className={modalStyles.footer}>
                <Button
                  type="button"
                  variant="outline"
                  onPress={() => setActiveStepIndex((index) => (index > 0 ? index - 1 : index))}
                  isDisabled={!canMoveBack || isSubmitting}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onPress={resetWizard}
                  isDisabled={isSubmitting}
                >
                  Start Over
                </Button>

                {canMoveNext ? (
                  <Button
                    type="button"
                    variant="primary"
                    onPress={() => {
                      if (!canAdvance) {
                        setShowErrorsByStep((previous) => ({
                          ...previous,
                          [currentStep.key]: true,
                        }));
                        return;
                      }
                      setSubmitError(null);
                      setActiveStepIndex((index) => Math.min(index + 1, steps.length - 1));
                    }}
                    isDisabled={isSubmitting}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    isDisabled={isSubmitting}
                    onPress={async () => {
                      if (stepErrors.review.length > 0) {
                        setShowErrorsByStep((previous) => ({
                          ...previous,
                          review: true,
                        }));
                        return;
                      }
                      setSubmitError(null);
                      setIsSubmitting(true);
                      try {
                        await postJSON<typeof createPayload, unknown>('/menus', createPayload);
                        onCreated?.();
                        resetWizard();
                        close();
                      } catch (error: unknown) {
                        setSubmitError(getErrorMessage(error, 'Unable to create menu.'));
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Menu'}
                  </Button>
                )}
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
