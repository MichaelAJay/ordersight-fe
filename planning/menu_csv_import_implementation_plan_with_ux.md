# Menu & CSV Import Implementation Plan (JIRA-Style Stories)

> This document defines the sequenced implementation plan for CSV-based Menu + Item onboarding.
>
> Engineering Directive:
> Implement from **first principles**, not cargo cult programming.
>
> - Understand invariants before writing code.
> - Respect database constraints as system truth.
> - Make failure states explicit and observable.
> - Prefer clarity over cleverness.
>
> This plan aligns with:
>
> - RTM: MNU-1, MNU-2, STO-1, ORD-1 (org-owned menus linked to stores, store-scoped orders)
> - Roadmap Phase 1: Store/Menu management + CSV import/export

---

# EPIC E1 — Import Field Contract (FE/BE Handshake)

## Story 1 — Define Import Field Registry

### Goal

Create a versioned Import Field contract that abstracts DB column names.

### Implementation

Define import modes:

- ITEM_CATALOG
- MENU_LAYOUT

Define import fields (non-DB-facing keys):

ITEM_CATALOG:

- item_name (required)
- sku
- item_description
- base_price (required)
- is_active

MENU_LAYOUT:

- menu_name (required)
- category_name
- category_sort_order
- item_name (required)
- sku
- item_description
- base_price
- menu_price_override
- display_name
- sort_order
- is_active

Expose as:
{
"version": 1,
"mode": "MENU_LAYOUT",
"required_fields": [...],
"optional_fields": [...]
}

### Acceptance Criteria

- FE and BE share stable contract.
- Required fields enforced at API layer.
- Versioned for future-proofing.

---

# EPIC E2 — CSV Parsing & Prepare Flow

## Story 2 — Backend CSV Parsing Utility

### Endpoint

POST /imports/menus/parse

### Response

{
"headers": ["Menu", "Category", "Item", "Price"],
"row_count": 120,
"sample_rows": [{...}]
}

### Constraints

- Max 10MB
- Max 10k rows
- UTF-8 only

### Acceptance Criteria

- Proper header detection.
- Graceful malformed CSV handling.
- Limits enforced.

---

## Story 3 — Column Mapper UI (React Aria)

### Goal

Allow user to map CSV headers → Import Fields.

### UX Structure

- Required fields section
- Optional fields (collapsible)
- Combobox per field
- Auto-suggestion based on fuzzy header match

### Acceptance Criteria

- Required mappings must be complete before proceeding.
- Users can override auto-detected mappings.
- Mapping state preserved when navigating back.

---

## Story 4 — Prepare Endpoint (Preview + Validation)

### Endpoint

POST /imports/menus/prepare

### Request

{
"mode": "MENU_LAYOUT",
"mapping": {
"menu_name": "Menu",
"category_name": "Category",
"item_name": "Item",
"base_price": "Price"
}
}

### Response

{
"preview_rows": [...],
"issues": [
{
"row": 12,
"field": "base_price",
"code": "INVALID_MONEY",
"message": "Cannot parse '$abc'"
}
],
"estimated_creates": {
"menus": 1,
"categories": 6,
"items": 42,
"memberships": 42
}
}

### Acceptance Criteria

- No DB writes occur.
- Validation errors are row-specific.
- Required fields missing produce blocking error.

---

# EPIC E3 — Commit as Import Job

## Story 5 — Create Import Job

### Endpoint

POST /imports/menus/commit

### Response

{
"job_id": "uuid"
}

### Job State Machine

- queued
- processing
- completed
- failed

### Acceptance Criteria

- Job created instantly.
- Raw CSV + mapping persisted.
- Pollable via GET /imports/:job_id.

---

## Story 6 — Import Processor (MENU_LAYOUT Mode)

### Invariants

- Org isolation via composite FKs.
- Unique active menu names per org.
- Unique category names per menu.
- SKU uniqueness per org.

### Pseudocode

For each row:
Begin transaction

menu = find_or_create_menu(org_id, menu_name)

category = find_or_create_category(menu_id, category_name)

item = upsert_menu_item(org_id, sku, name, description, base_price)

upsert menu_item_in_menu with: - org_id - menu_id - menu_item_id - category_id - overrides - sort_order

Commit

### Acceptance Criteria

- Re-running same CSV is idempotent.
- No duplicate menu_items created.
- FK violations impossible under correct logic.

---

## Story 7 — Import Processor (ITEM_CATALOG Mode)

### Behavior

Upsert menu_items only.

Match priority:

1. SKU (if provided)
2. Normalized name

### Acceptance Criteria

- Deterministic upserts.
- SKU constraint respected.
- Name collision produces warning.

---

# EPIC E4 — Store Assignment Flow

## Story 8 — Assign Menu to Store

### Endpoint

PUT /stores/:store_id/menus

### Behavior

- Assign multiple menus
- Enforce single primary via DB unique partial index

### Acceptance Criteria

- Exactly one primary per store.
- Changing primary clears previous primary.

---

# EPIC E5 — UX Completion + Hardening

## Story 9 — Import Progress UI

### Endpoint

GET /imports/:job_id

### Response

{
"status": "processing",
"created": { ... },
"warnings": 12,
"errors": 0
}

### Acceptance Criteria

- User sees live progress.
- Final summary displayed clearly.

---

## Story 10 — Error Report CSV

### Endpoint

GET /imports/:job_id/errors.csv

### Acceptance Criteria

- Downloadable CSV contains row_number + error_code + message.
- Users can fix and re-upload.

---

# First Principles Checklist

Before coding each story:

1. What invariant does this story protect?
2. What failure mode are we preventing?
3. Is the database constraint doing the heavy lifting?
4. Is this behavior observable in logs and UI?
5. Would this still work at 1,000 orgs?

Never implement behavior because “that’s how imports are usually done.”
Always reason from:

- Schema constraints
- Product invariants
- UX clarity
- Idempotency and safety

---

# Done Criteria for Entire Feature

- Org admin can upload CSV.
- Map columns.
- Preview with validation.
- Commit import.
- See deterministic results.
- Assign menu to store.
- Take an order successfully using imported menu.

Time-to-first-menu target: < 5 minutes.

---

# Appendix — UI/UX + React Aria Wizard Guide

# Menu CSV Import Wizard — UI/UX + React Aria Components Guide (Companion)

This document is a **UX-focused companion** to `menu_csv_import_implementation_plan.md`. It maps each wizard step to **React Aria Components** (RAC) and includes interaction patterns, validation behaviors, and accessibility considerations.

> Engineering Directive (repeat, because it matters): Implement from **first principles**, not cargo cult programming.
>
> - UX first principles: reduce cognitive load, make the next action obvious, provide fast feedback, preserve user control, and prevent irreversible mistakes.

---

## Goals

1. **Time-to-first-menu < 5 minutes** for the common case.
2. **High trust**: users understand what will happen before it happens.
3. **Low friction**: accepts real-world CSV messiness while guiding the user.
4. **Accessible**: full keyboard support, screen reader friendly, clear error messaging.

---

## Wizard Structure (recommended)

A multi-step “wizard” with **explicit steps**, persisted state, and a single forward path:

1. **Choose Import Type**
2. **Upload CSV**
3. **Map Columns**
4. **Preview & Validate**
5. **Commit Import**
6. **Results**
7. _(Optional)_ **Assign Menus to Stores**

### React Aria approach

RAC doesn’t ship a Stepper component, so implement the wizard as:

- **State machine in code** (`step` enum) + a visual progress indicator, or
- **Tabs** as steps (disabled except current / completed), or
- **ListBox** as a step nav (left rail) with the current panel on the right.

**Recommendation:** A _state-machine wizard_ + **ProgressBar** + “Back/Next” buttons.

- Clear, linear, prevents users skipping required steps
- Easy to disable Next if validations fail

---

## Component Cheatsheet (RAC)

### Primary building blocks

- `Form` – wrap each step for validation + submission semantics
- `Button` – primary/secondary actions
- `Heading`, `Text` – consistent page scaffolding
- `RadioGroup` – mode selection (Item Catalog vs Menu Layout)
- `FileTrigger` – file picker
- `DropZone` – drag & drop (optional but highly ergonomic)
- `Table` – preview rows
- `ComboBox` + `ListBox` – mapping controls (field → column)
- `Checkbox`, `Switch` – optional toggles (e.g., “treat blanks as inactive”)
- `Dialog` / `Modal` – confirm commit, show blocking errors, show “are you sure?”
- `Toast` (if you have one) – success/warning summaries
- `ProgressBar` – job progress or step progress

### Supporting components

- `TextField` – “menu name default” when mode lacks menu name
- `Tooltip` – explain tricky fields (SKU matching, price parsing)
- `Popover` – mapping help or field examples

---

## Step-by-step UX + Components

## Step 1: Choose Import Type

### UX intent

Users shouldn’t have to understand your schema. Present two plain-English options:

- **Menu layout (recommended)**: “My spreadsheet is basically the menu.”
- **Item catalog**: “I have a master list of items; I’ll build menus later.”

### Components

- `Heading`, `Text`
- `RadioGroup` with two options
- Optional: `Card` styling in your design system, but RAC-wise keep it semantic

### Acceptance UX

- Default to **Menu layout**.
- Provide a short “What you’ll need” bullet list under each option.

---

## Step 2: Upload CSV

### UX intent

Minimize failure:

- show file requirements and a sample template link
- handle errors immediately (bad CSV, too big, empty headers)

### Components

- `FileTrigger` (required)
- `DropZone` (recommended)
- `Text` for constraints and tips
- `Button` for “Download template CSV”

### Behaviors

- As soon as file is selected, call `POST /imports/menus/parse`.
- Show:
  - file name, size
  - detected headers count
  - row count
- If parse fails, show an error summary and allow re-upload.

### Nice touch

If headers are missing, offer:

- “Use first row as headers” toggle (only if you support it)
- Otherwise: explain how to fix

---

## Step 3: Map Columns (the heart of usability)

### UX intent

Users think: “My Column Q is Item Name.”
You think: “`import_field=item_name` maps to `csv_header=Column Q`.”

You want the **internal fields-first UI**:

- left: internal fields (required + optional)
- right: mapping dropdown to pick CSV column
- below: immediate sample value preview from mapped column

### Components

- `Form`
- `ComboBox` for each internal field (source: CSV headers)
- `Table` (or simple `ListBox`) for showing header list
- `Text` for “required” and inline descriptions
- `Tooltip` for tricky ones (prices, booleans, SKU matching)

### Suggested layout

**Required fields (always visible)**

- Menu Name (required in menu layout)
- Item Name (required)
- Base Price (required for item catalog; optional for menu layout if you allow price override only)

**Optional fields (collapsible section)**

- SKU, Description, Active flags, Sort orders, Display name override, etc.

### Auto mapping

When parse results return headers:

- Try fuzzy match:
  - “Item”, “Item Name” → Item Name
  - “Cost”, “Price” → Base Price
  - “Section”, “Category” → Category Name
- Pre-fill and let user edit.

### Validation UX

- “Next” is disabled until all required fields mapped.
- If two internal fields map to the same CSV header and that’s invalid (e.g., item_name and menu_name), show inline error.

---

## Step 4: Preview & Validate

### UX intent

Build trust: show what will be created/updated and highlight problems.

### Components

- `Heading`, `Text`
- `Table` for preview rows (first N)
- `Checkbox` for “Show only rows with issues”
- `Tabs` for views:
  - Preview
  - Issues (errors/warnings list)
  - Summary (counts)

_(Tabs are optional; a segmented UI works too.)_

### Preview table features

- Sticky header
- Column showing “Status” per row:
  - ✅ OK
  - ⚠️ Warning
  - ❌ Error
- Inline cell highlighting for invalid parse fields (price, boolean, missing required)

### Issue list UX

Group issues by:

- Blocking errors
- Warnings

Each issue should include:

- row number
- field
- message
- hint (“Expected currency like 12.50 or 1250”)

### Acceptance UX

- If blocking errors exist: disable “Commit” and present “Fix mapping” + “Download errors CSV” (if you support it pre-commit).
- If warnings only: allow commit but require explicit acknowledgment:
  - checkbox “Proceed with warnings” or confirmation dialog.

---

## Step 5: Commit Import

### UX intent

Prevent “oops” and set expectations.

### Components

- `Dialog` / `Modal` (confirm commit)
- `Button` primary: “Start Import”
- `ProgressBar` after commit begins

### Confirmation dialog content (recommended)

- Show summary:
  - `+X menus`, `+Y categories`, `+Z items`, `+W memberships`
- Show matching behavior:
  - “We will match by SKU when present; otherwise by name.”
- Optional toggles:
  - “Don’t update existing items; create only” (future feature)

---

## Step 6: Import Progress + Results

### UX intent

Make it observable and calm. Imports can take time; user needs confidence.

### Components

- `ProgressBar` (indeterminate until BE provides percent; otherwise show staged progress)
- `Text` status + counts updating
- `Button` “Run in background” (just navigates away while job continues)
- `Button` “Download error report” if failed

### Status presentation

- queued / processing / completed / failed
- show start time + elapsed
- show counts created/updated and warning/error counts

### Results page

- Completed:
  - “Go assign menus to stores”
  - “View menus”
- Failed:
  - error summary + error report download
  - “Fix CSV and try again” CTA

---

## Step 7 (Optional but recommended): Assign Menu(s) to Store(s)

### UX intent

Users want: “Make this menu live for my store.”

### Components

- `ComboBox` to pick store
- `ListBox` or `Table` to select menus
- `Checkbox` for “Set as primary”
- `Dialog` confirm changing primary menu if one exists

### UX behavior

- If the org has only one store: default-select it.
- If they imported exactly one menu: auto-select it.
- Make “Set as primary” prominent.

---

## Validation & Messaging Principles (UX)

1. **Prefer inline errors** over global banners.
2. **Never surprise the user**: show summary before commit.
3. **Don’t block on warnings** — but require acknowledgment.
4. **Use consistent terminology** (“Item Name”, not “menu_items.name”).

### RAC validation approach

- Use `Form` + field-level validation messages.
- Treat missing required mapping as a field-level error on that mapping control.

---

## Accessibility Considerations (RAC strengths)

- Ensure focus moves to the next step heading on step transition.
- Ensure Dialogs trap focus and have clear primary action.
- Table should be keyboard navigable; keep row count limited in preview to avoid fatigue.
- Provide non-color indicators for errors (icons + text).

---

## Suggested Wizard State Model (frontend)

A simple state object persisted across steps:

```ts
type ImportMode = 'ITEM_CATALOG' | 'MENU_LAYOUT';

type ImportWizardState = {
  mode: ImportMode;
  file?: File;
  parse?: { headers: string[]; rowCount: number; sampleRows: Record<string, string>[] };

  mapping: Record<string /* importFieldKey */, string /* csvHeader */>;

  prepare?: {
    previewRows: any[];
    issues: {
      row: number;
      field: string;
      code: string;
      message: string;
      severity: 'error' | 'warning';
    }[];
    estimatedCreates: Record<string, number>;
  };

  commit?: { jobId: string };
  job?: {
    status: string;
    created: Record<string, number>;
    updated: Record<string, number>;
    warnings: number;
    errors: number;
  };
};
```

_(Keep the mapping keys tied to your Import Field contract version.)_

---

## What NOT to do (common “cargo cult” traps)

- ❌ A wizard that lets users click “Next” but fails later without clear reason.
- ❌ A mapper UI that maps CSV columns directly to DB columns.
- ❌ A preview that shows raw values but not what will be created/updated.
- ❌ A commit step that blocks for a long time without progress feedback.
- ❌ Forcing users to understand “org_id/menu_item_in_menu” vocabulary.

---

## Definition of Done (UX)

- A non-technical user can import a menu from a spreadsheet **without reading docs**.
- The mapping step is understandable in < 60 seconds.
- Preview clearly explains what will happen and what needs fixing.
- Job progress is observable; failures are actionable via downloadable report.
- After completion, user can assign a primary menu to a store.

---
