# Menu CSV Import Implementation Plan + UX (Reconciled)

**Last Updated:** 2026-02-17  
**Status:** Reconciled to latest planning + DDL
**Canonical Planning Doc:** `menu_csv_import_implementation_plan_with_ux.md` remains the single source of truth for CSV import wizard behavior.

## Reconciliation Inputs

- `ordersight/planning/menu_stories_update.md`
- `ordersight-fe/planning/menu_stories_update_2.md`
- `ordersight/planning/menu_system_ddl.sql`
- `ordersight/migrations/0001_init_up.sql`

`menu_stories_update_2.md` takes precedence wherever the two update docs overlap.

---

## 1. Scope and Reconciliation Notes

This document supersedes the older FE import plan that used:

- import mode selection (`ITEM_CATALOG` vs `MENU_LAYOUT`)
- legacy `/imports/menus/*` endpoints
- a 7-step flow with store assignment in-wizard

This reconciled version incorporates updates from Stories `3.4a` through `3.4e` plus backend companions `3.2a` and `3.3a`, while keeping this plan as the canonical implementation reference.

### In Scope

- Upload + preview CSV
- Required/optional field mapping
- Column grouping for modifier groups
- Hard rule mapping (`min_quantity`, `max_quantity`, `lead_time_hours`, `order_multiple`)
- Soft rule mapping (freetext notes via `soft_rule_mappings`)
- Preview + row-level validation
- Commit + results
- Save and reuse mappings (`import_mappings`)

### Out of Scope (for this wizard)

- In-wizard store assignment
- Order-time rule enforcement
- Deferred fields listed in Story section 6 (taxable, setup fee, deposits, etc.)

---

## 2. Canonical Data Contract (FE/BE)

### Rule Model Distinction (Hard vs Soft)

- Hard rules persist to `menu_item_rules` and are enum-typed (`rule_type`, `value`), machine-interpretable, and candidates for future runtime enforcement.
- Soft rules persist to `menu_item_soft_rules` and are freetext/user-defined:
  - `label`
  - `content`
  - `is_customer_visible` (default `false`)
  - `sort_order` (default `0`)
- Soft rules are display-only and are candidates for promotion to hard rule enum types as stable patterns emerge.

## 2.1 Field Mapping

### Required fields

- `item_name`
- `base_price`

### Optional fields

- `description`
- `category`
- `price_unit`
- `serving_description`
- `sku`
- `dietary_tags`
- `allergens`
- `sort_order`

## 2.2 Modifier Group Bundles

Each bundle maps a related set of CSV columns:

```json
{
  "name_column": "OptionGroup1Name",
  "choices_column": "OptionGroup1Choices",
  "pricing_column": "OptionGroup1Pricing",
  "min_column": "OptionGroup1Min",
  "max_column": "OptionGroup1Max",
  "choice_delimiter": "|"
}
```

Rules:

- `name_column` and `choices_column` are required for a valid bundle.
- Empty/NULL `name_column` for a row means “skip this modifier group for this row.”
- `pricing_column` is optional; missing price defaults to `0`.

## 2.3 Rule Mappings

Rules are mapped per-column:

```json
{
  "min_quantity": "MinOrder",
  "max_quantity": "MaxOrder",
  "lead_time_hours": "LeadTimeHours",
  "order_multiple": "OrderMultiple"
}
```

Rules:

- Empty/NULL mapped cell means “rule absent for this row.”
- Backend validates numeric semantics; invalid values return row-level errors.
- Rule value semantics:
  - `min_quantity`: integer `>= 1`
  - `max_quantity`: integer `>= 1` and `>= min_quantity` when both exist
  - `lead_time_hours`: integer `>= 0`
  - `order_multiple`: integer `>= 2` (`1` is a no-op and should be rejected)

## 2.4 Soft Rule Mappings

Soft rules are mapped as column-to-label pairs:

```json
[
  { "column": "Notes", "label": "Operator Notes" },
  { "column": "AvailabilityDays", "label": "Availability" }
]
```

Rules:

- Each row maps to `{ label, content }`, where `content` comes from the mapped column.
- Empty/NULL mapped cell means “soft rule absent for this row.”
- Imported soft rules default to `is_customer_visible = false`.
- No uniqueness is required for soft rule labels.

## 2.5 Mapping Payload Shape

`POST /api/imports/csv/:session_id/map`

```json
{
  "required": {
    "item_name": "ItemName",
    "base_price": "BasePrice"
  },
  "optional": {
    "description": "Description",
    "category": "Category",
    "price_unit": "PriceUnit",
    "serving_description": "ServingDescription",
    "sku": "Sku",
    "dietary_tags": "DietaryTags",
    "allergens": "Allergens",
    "sort_order": "SortOrder"
  },
  "modifier_group_bundles": [
    {
      "name_column": "OptionGroup1Name",
      "choices_column": "OptionGroup1Choices",
      "pricing_column": "OptionGroup1Pricing",
      "min_column": "OptionGroup1Min",
      "max_column": "OptionGroup1Max",
      "choice_delimiter": "|"
    }
  ],
  "rule_mappings": {
    "min_quantity": "MinOrder",
    "lead_time_hours": "LeadTimeHours"
  },
  "soft_rule_mappings": [
    { "column": "Notes", "label": "Operator Notes" },
    { "column": "AvailabilityDays", "label": "Availability" }
  ]
}
```

## 2.6 Preview Contract Expectations

Validated preview data must include, per row:

- normalized item payload
- resolved modifier groups (`name`, `min_selections`, `max_selections`, `options[]`)
- resolved rules (`rule_type`, `value`)
- resolved soft rules (`label`, `content`, `is_customer_visible`, `sort_order`)
- row-level validation errors (if any)

---

## 3. UX Flow (Stories 3.4a-3.4e)

## Step 1 — Upload & Preview (`3.4a`)

### User goal

Confirm the selected CSV before mapping.

### UI

- `FileTrigger`
- optional `DropZone`
- preview table (first 10 rows)
- file metadata (name, size, row count)

### Behavior

- Parse client-side (Papa Parse or equivalent)
- Show CSV headers verbatim from the uploaded file (no FE renaming/normalization in Step 1 UI)
- Reject:
  - non-CSV
  - empty files
  - files over `5MB`
- Cancel returns to the menu item list.
- Next goes to field mapping

---

## Step 2 — Required & Optional Mapping (`3.4b`)

### User goal

Map CSV headers to menu item fields.

### UI

- Required field section
- Optional field section
- dropdown or drag-target assignment
- per-field 3-row sample preview

### Rules

- Required fields must be mapped to proceed.
- One CSV column may map to only one destination.
- Unmapped columns carry forward to Step 3.
- Back returns to upload.

---

## Step 3 — Column Grouping for Modifier Groups + Hard/Soft Rules (`3.4c`)

### User goal

Convert remaining columns into structured modifier bundles, hard rules, and soft rules.

### UI

- list of unmapped columns
- “Create modifier group bundle” card builder
- hard-rule/soft-rule mapping action for remaining columns
- 2-3 row preview per bundle

### Modifier bundle card slots

- Group Name (required)
- Choices (required)
- Pricing (optional)
- Min Selections (optional)
- Max Selections (optional)

### Rule mapping

- map each remaining column to one rule type:
  - `min_quantity`
  - `max_quantity`
  - `lead_time_hours`
  - `order_multiple`
- interaction label: `Map as Rule`
- UI hint for `order_multiple`: _"Use 2 or greater. A value of 1 has no effect and is invalid."_

### Soft rule mapping

- map remaining columns to notes by setting:
  - `column` (source column)
  - `label` (default to column header; editable)
- interaction label: `Map as Note`
- each non-empty row value becomes soft rule `content` for that item.
- empty/NULL cell means no soft rule for that row.

### Completion

- Remaining columns can be skipped.
- User can proceed with zero modifier bundles, zero hard rules, and zero soft rules.

### Delimiter handling

- auto-detect delimiter (`|`, `;`, `/`)
- user override allowed

---

## Step 4 — Preview & Confirm (`3.4d`)

### User goal

See exactly what will be created/reused and catch errors before commit.

### UI

- structured item preview grouped by category (if mapped)
- each item shows:
  - Name, Price, Description
  - SKU, serving description, dietary tags, allergens
  - Hard Rules
  - Soft Rules
  - Modifier groups + options + price adjustments
- error section for invalid rows
- summary bar

### Validation/insight requirements

- row-level errors surfaced clearly
- duplicate item detection (name and/or SKU if mapped)
- duplicate item action must be explicit: `skip duplicates` or `import all`
- rule validation errors must include concrete guidance (e.g., "`order_multiple` must be an integer >= 2")
- summary bar must include counts for: total items, items with errors, modifier groups, hard rules (and soft rules if available)
- structural dedup behavior for modifier groups reflected in preview:
  - same name + same option set => shared group
  - same name + different options => distinct groups

---

## Step 5 — Commit + Results (`3.4d` + `3.3a`)

### User goal

Run import and review deterministic results.

### UI

- Import action
- post-commit results summary

### Required result metrics

- items created
- items updated (if applicable)
- modifier groups created
- modifier groups reused
- hard rules created
- soft rules created (if returned by backend summary)
- rows skipped/errored

---

## Step 6 — Save & Reuse Mapping (`3.4e`)

### User goal

Avoid remapping for recurring spreadsheet formats.

### Save prompt

After successful import:

- prompt to save mapping
- optional mapping name (default from file name)

### Saved mapping contents

- Step 2 field mappings
- Step 3 modifier bundles
- Step 3 hard rule mappings
- Step 3 soft rule mappings
- delimiter choice/override

### Retrieval behavior

On future uploads:

- offer saved mappings list
- if headers fully match, skip to preview
- if partial mismatch, fall back to mapping flow with compatible columns prefilled

### Backend contract

- `POST /api/v1/imports/mappings`
- `GET /api/v1/imports/mappings`
- `PATCH /api/v1/imports/mappings/:id` (rename)
- `DELETE /api/v1/imports/mappings/:id`

Org scoping is derived from the authenticated org context on the backend.

Storage table: `import_mappings` (`menu_system_ddl.sql`).

---

## 4. React Aria Component Mapping

Recommended RAC components by step:

- Upload: `FileTrigger`, `DropZone`, `Button`, `Table`, `Text`
- Field mapping: `Form`, `ComboBox`, `ListBox`, `Text`, `Tooltip`
- Grouping: `Form`, `ComboBox`, `Button`, `TextField`, `Table`
- Preview: `Table`, `Tabs` or segmented controls, `Checkbox`, `Text`
- Commit/results: `Dialog`, `Button`, `ProgressBar`, `Text`
- Saved mappings: `ComboBox`, `ListBox`, `Dialog`, `Button`

Wizard shell:

- controlled step state machine + linear Back/Next actions
- no free skipping of incomplete steps

---

## 5. Frontend State Model (Suggested)

```ts
type RuleType = 'min_quantity' | 'max_quantity' | 'lead_time_hours' | 'order_multiple';
type SoftRuleMapping = { column: string; label: string };

type ModifierGroupBundle = {
  id: string;
  nameColumn?: string;
  choicesColumn?: string;
  pricingColumn?: string;
  minColumn?: string;
  maxColumn?: string;
  choiceDelimiter: string;
};

type ImportWizardState = {
  file?: File;
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;

  requiredMappings: Record<'item_name' | 'base_price', string | undefined>;
  optionalMappings: Partial<
    Record<
      | 'description'
      | 'category'
      | 'price_unit'
      | 'serving_description'
      | 'sku'
      | 'dietary_tags'
      | 'allergens'
      | 'sort_order',
      string
    >
  >;

  modifierGroupBundles: ModifierGroupBundle[];
  ruleMappings: Partial<Record<RuleType, string>>;
  softRuleMappings: SoftRuleMapping[];

  preview?: {
    rows: unknown[];
    summary: {
      totalItems: number;
      itemsWithErrors: number;
      modifierGroupsToCreate: number;
      rulesToCreate: number;
      softRulesToCreate?: number;
    };
    errors: Array<{
      row: number;
      field: string;
      code: string;
      message: string;
      severity: 'error' | 'warning';
    }>;
  };

  commit?: {
    status: 'idle' | 'running' | 'completed' | 'failed';
    results?: Record<string, number>;
  };

  savedMappingId?: string;
};
```

---

## 6. Acceptance Checklist

- Required mappings block progress until valid.
- Modifier bundle cards support multiple bundles.
- Rule mapping supports all current enum values.
- Soft rule mapping supports column + label configuration.
- Preview shows new menu item fields, hard rules, and soft rules.
- Row errors are explicit and actionable.
- Import results include created/reused modifier group counts.
- Saved mapping flow works for full-match and partial-match headers.
- Keyboard navigation and screen reader labels are complete.

---

## 7. Implementation Sequence

1. Build Step 1 + Step 2 UI with state persistence.
2. Add Step 3 bundle/hard-rule/soft-rule mapping interactions.
3. Wire mapping payload to `POST /api/imports/csv/:session_id/map`.
4. Implement Step 4 preview/error rendering.
5. Implement commit/results metrics rendering.
6. Add save/reuse mapping UX + endpoints.
7. Add integration tests for:
   - duplicate modifier names with different option sets
   - rule parsing failures
   - soft-rule mapping with empty-cell skip behavior
   - header mismatch fallback for saved mappings

---

## 8. Deliberate Deferrals

Per this plan's scoped deferrals (aligned to the latest story updates), these remain out of this feature slice:

- taxable logic
- setup/deposit fields
- utensils included
- included-with relationships
- day/date availability scheduling
