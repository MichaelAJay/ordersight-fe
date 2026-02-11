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
