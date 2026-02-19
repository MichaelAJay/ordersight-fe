# Menu Domain Alignment Plan (Menus vs Menu Items)

**Date:** 2026-02-18  
**Status:** Draft for consensus before implementation  
**Audience:** FE + BE

## Decisions (Confirmed 2026-02-18)

- Loose items definition: **All catalog items are composable into menus** (Option B).
- IA shape: **Tabs within `/menus`** (Option B).
- Post-import create-menu behavior: **Backend commit enhancement** (Option A).
- Clone delivery: **FE orchestration first** (Option A).

## 1. Problem Statement

Current UX implies a tenant has one singular menu ("Your menu"), but backend semantics are:

- `menu_items` = reusable catalog items
- `menus` = named groupings of menu items

This mismatch causes user confusion after import. We need the product to clearly communicate:

1. Spreadsheet import primarily imports **menu items** into the catalog.
2. Creating a **menu** is a separate composition step (can happen immediately or later).
3. `/menus` should show real menus, not raw item catalog rows.

## 2. Current-State Findings (from code)

- `ordersight-fe/src/pages/MenusPage.tsx` currently loads `GET /menu-items` and labels it "Your menu".
- `ordersight-fe/src/pages/MenuImportWizardPage.tsx` copy is menu-oriented ("Back to your menu", "View your items" appears only at end).
- Backend already supports menu CRUD + assignment:
  - `GET /menus`
  - `POST /menus`
  - `POST /menus/:id/items`
- Backend does **not** currently provide a menu clone endpoint.
- Import commit (`POST /imports/csv/:session_id/commit`) returns counts/errors, not imported `menu_item_id`s.

## 3. Target Product Model

- **Menu Item Library**: all catalog items available for composing menus.
- **Menus Index**: list of org menus with item counts and status.
- **Import Wizard**: framed as "Import menu items", with optional post-import menu creation.

## 4. Proposed UX Flow

1. User runs spreadsheet import wizard to import menu items.
2. Final step asks:  
   "Your menu items are ready. Create a menu with these items now?"
   - `Yes`: user enters menu name, system creates menu + assigns imported items.
   - `No`: items remain in catalog for later composition.
3. `/menus` page shows menus list:
   - If no menus: "No menus created yet."
   - CTA: "Create menu from item library"
   - Secondary CTA: "Import more menu items"
4. Item catalog remains visible in a nearby view (`/menus/items` or tab) for composition workflows.

## 5. API Plan (Reality vs Delta)

Already available:

- `GET /menus` (org menu list)
- `POST /menus` (create empty menu)
- `POST /menus/:id/items` (bulk assign items)
- `GET /menu-items` (item library source)

Needed for clean post-import flow:

- **Recommended:** extend import commit to optionally create/seed a menu atomically.
  - `POST /imports/csv/:session_id/commit`
  - Optional body:
    ```json
    {
      "create_menu": {
        "name": "Lunch Menu - Spring 2026",
        "description": null
      }
    }
    ```
  - Response adds optional:
    - `created_menu_id`
    - `assigned_item_count`

Why this is recommended:

- Avoids fragile FE matching of imported rows back to item IDs.
- Guarantees menu creation uses exactly imported items in one transaction.
- Keeps wizard UX simple.

Clone support:

- Phase 1 clone can be FE-orchestrated using existing APIs (`GET /menus/:id` + `POST /menus` + `POST /menus/:id/items`).
- Optional Phase 2 backend endpoint: `POST /menus/:id/clone`.

## 6. Executable Implementation Plan

## Phase A - Copy and IA Alignment

Steps:

- Update wizard copy to "Import menu items from spreadsheet".
- Replace menu-singular language across `MenusPage` and wizard.
- Define IA: `/menus` = menus index, `/menus/items` (or tab) = item library.

Outcomes:

- Users understand import is item ingestion.
- `/menus` language no longer implies "single menu".

## Phase B - Backend Commit Enhancement

Steps:

- Add optional commit request payload in menu import handler/service.
- In commit transaction, if `create_menu` present:
  - create menu
  - assign imported items to the new menu
- Return `created_menu_id` and `assigned_item_count` when applicable.
- Add/adjust tests for commit-with-menu behavior.

Outcomes:

- Wizard can offer immediate "create menu from imported items" without extra lookup calls.

## Phase C - Menus Index Refactor (Frontend)

Steps:

- Refactor `ordersight-fe/src/pages/MenusPage.tsx` to load `listMenus()` from `ordersight-fe/src/services/menus.ts`.
- Render true menu cards/table (name, item count, active status, updated date).
- Empty states:
  - no menus + has catalog items
  - no menus + no catalog items
- Keep clear CTAs to:
  - create menu
  - import menu items
  - open item library

Outcomes:

- `/menus` aligns with backend model and user expectations.

## Phase D - Create Menu From Item Library

Steps:

- Build a focused "Create Menu" flow:
  - menu metadata (name/description)
  - select item IDs from library
  - submit `POST /menus`, then `POST /menus/:id/items`
- Keep first version simple (search + multi-select; no advanced filters required).

Outcomes:

- Users can compose menus from existing item catalog independent of import.

## Phase E - Wizard Post-Commit Decision

Steps:

- Add final decision dialog in import wizard:
  - `Yes` -> collect menu name and call commit with `create_menu`
  - `No` -> commit without menu creation
- Route after success:
  - with menu: to menu detail (or menus index with success notice)
  - without menu: to menus index empty-state with "Create menu" CTA

Outcomes:

- User mental model is explicit at the right time in the workflow.

## Phase F - Menu Clone (Required Capability)

Steps:

- Add "Clone menu" action from menus index/detail.
- Implement FE orchestration clone in V1; preserve item order.
- Optional follow-up: server-side clone endpoint for atomicity.

Outcomes:

- Menus become safely editable via clone-and-modify workflow.

## 7. Acceptance Criteria

- `/menus` no longer displays raw menu item catalog.
- Import flow language consistently says "menu items".
- User can import items and choose whether to create a menu immediately.
- User can create a menu later from catalog items.
- User can clone an existing menu.

## 8. Consensus Checkpoints (Need Decisions Before Build)

1. "Loose items" definition:
   - Option A: items not assigned to any menu
   - Option B: all catalog items are always composable (recommended V1)
2. Route design:
   - Option A: separate `/menus/items`
   - Option B: tabs within `/menus` (recommended V1 for lower routing churn)
   - Plain-language: this is just where the "item library" lives in navigation.
     - Option A = separate page URL (`/menus/items`).
     - Option B = same `/menus` page with tabs like `Menus | Item Library`.
3. Post-import create-menu behavior:
   - Option A: backend commit enhancement (recommended)
   - Option B: FE-only orchestration after commit
4. Clone delivery:
   - Option A: FE orchestration first (recommended)
   - Option B: backend clone endpoint first

## 9. Delivery Order Recommendation

1. Phase A (copy/IA decisions)
2. Phase B (backend commit enhancement)
3. Phase C + E (menus index + wizard final decision)
4. Phase D (create menu from item library)
5. Phase F (clone)
