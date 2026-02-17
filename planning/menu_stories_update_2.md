# Menu System — Stories Update (2026-02-16)

**Date:** 2026-02-16
**Context:** Pressure-testing the data model and CSV import wizard against a representative synthetic catering menu CSV. This uncovered: (1) modifier group names should not be unique per org, (2) the CSV import wizard needs an explicit column-grouping step for modifier groups, (3) menu items need a normalized rules table for extensible item-level constraints, (4) several missing fields on menu items (SKU, serving description, dietary tags, allergens), and (5) a need for soft rules — freetext, user-defined item notes that may be promotable to hard rules over time.

**Canonical DDL:** `menu_system_ddl.sql` is the source of truth for the complete schema. Stories in this document describe intent and acceptance criteria; the DDL defines the implementation.

**Replaces:** Story 3.4 in its original form (single story for the entire CSV wizard). The original five-step wizard is broken out into Stories 3.4a–e with backend companions 3.2a and 3.3a.

---

## 1. Schema Changes

### Story 6.1a: Relax Modifier Group Name Uniqueness Constraint

**As** a developer, **I want** the `modifier_groups` table to allow duplicate names within an org **so that** caterers can have multiple modifier groups with the same display name but different option sets (e.g., two "Bread Choice" groups with different options for different items).

**Acceptance Criteria:**

- Remove (or do not create) the `UNIQUE(org_id, name)` constraint on `modifier_groups`.
- Replace with a non-unique index on `(org_id, name)` for query performance.
- The `UNIQUE(modifier_group_id, name)` constraint on `modifier_options` remains — option names within a single group must still be distinct.
- Existing API endpoints for modifier group CRUD continue to function. No 409 conflict on duplicate group names.
- The modifier group list API response includes the group's options (or at minimum an option count/summary) so consumers can distinguish groups that share a name.

**Size:** S

---

### Story 6.1b: Menu Item Rules Table

**As** a developer, **I want** a `menu_item_rules` table to store item-level rules **so that** we can capture an extensible set of item constraints and metadata without modifying the menu_items schema each time a new rule type is needed.

**Acceptance Criteria:**

- Migration creates `menu_item_rules` table:

  | Field        | Type                       | Notes                                                                                      |
  | ------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
  | id           | UUID                       | PK                                                                                         |
  | menu_item_id | UUID                       | FK → MenuItem, ON DELETE CASCADE                                                           |
  | rule_type    | menu_item_rule_type (enum) | Postgres enum. Values: `min_quantity`, `max_quantity`, `lead_time_hours`, `order_multiple` |
  | value        | varchar(100)               | Interpreted by `rule_type`. Validated on write.                                            |
  | created_at   | timestamptz                |                                                                                            |
  | updated_at   | timestamptz                |                                                                                            |

- Constraint: `UNIQUE(menu_item_id, rule_type)` — one rule of each type per item.
- Index on `menu_item_id` for efficient lookups when loading an item.
- `rule_type` is a Postgres enum (`menu_item_rule_type`). The schema is the documentation — valid rule types are defined at the database level, not just in application code. Adding a new rule type requires a migration, which is acceptable.
- Initial enum values: `min_quantity`, `max_quantity`, `lead_time_hours`, `order_multiple`.
- Migration is reversible.

**Size:** S

**Notes:**

- Rules are display-only for the current scope (menu management). They will become enforceable constraints when order placement is implemented.
- `value` is stored as a varchar. The API validates that the value is parseable for its rule type (e.g., `min_quantity` must be a positive integer). Invalid values are rejected with 422.
- See `menu_system_ddl.sql` for the full CREATE TYPE and CREATE TABLE statements.

---

### Story 6.1c: Additional Menu Item Fields

**As** a developer, **I want** additional fields on `menu_items` for SKU, serving description, dietary tags, and allergens **so that** the system can store the full breadth of data caterers track about their items.

**Acceptance Criteria:**

- Migration adds the following columns to `menu_items`:

  | Field               | Type                   | Notes                                                                             |
  | ------------------- | ---------------------- | --------------------------------------------------------------------------------- |
  | sku                 | varchar(100), nullable | External-facing item code. e.g., `PLTR-SAND-EXEC`                                 |
  | serving_description | varchar(255), nullable | Freetext. e.g., "Serves 10-12", "1 cup"                                           |
  | dietary_tags        | text, nullable         | Semicolon-delimited freetext. e.g., "vegetarian; contains dairy; contains gluten" |
  | allergens           | text, nullable         | Semicolon-delimited freetext. e.g., "gluten; dairy; fish"                         |

- Constraint: `UNIQUE(org_id, sku) WHERE sku IS NOT NULL` — SKUs must be unique within an org when present, but are optional.
- Migration is reversible (down migration drops the columns).

**Size:** S

**Notes:**

- `dietary_tags` and `allergens` are freetext for MVP. If filtering by tag/allergen becomes a product requirement, these should be normalized into a tags table with a join. For now, they are display-only.
- `serving_description` is deliberately unstructured. Parsing "Serves 18-22" into min/max integers is deferred — the value is inconsistent across caterers ("Serves 10", "1 cup", "Feeds 20-25") and the effort to normalize it doesn't pay off until order-time headcount calculations are in scope.

---

### Story 6.1d: Menu Item Soft Rules Table

**As** a developer, **I want** a `menu_item_soft_rules` table to store freetext, user-defined item-level notes **so that** caterers can express constraints and information that our hard rule types don't yet cover.

**Rationale:** Hard rules (`menu_item_rules`) are a closed enum — machine-interpretable, eventually enforceable, but limited to what we've explicitly defined. Soft rules fill the gap: they let caterers express things like "Call to confirm if ordering more than 3 GF platters," "Seasonal — check availability," or "48-hour cancellation policy." These are display-only and open-ended. The naming convention (`soft_rules` alongside `rules`) signals to the team that soft rules are candidates for promotion into the hard rules enum as patterns emerge from real usage.

**Acceptance Criteria:**

- Migration creates `menu_item_soft_rules` table:

  | Field               | Type         | Notes                                                                                |
  | ------------------- | ------------ | ------------------------------------------------------------------------------------ |
  | id                  | UUID         | PK                                                                                   |
  | menu_item_id        | UUID         | FK → MenuItem, ON DELETE CASCADE                                                     |
  | label               | varchar(100) | Short heading. e.g., "Cancellation Policy", "GF Notice", "Seasonal Note"             |
  | content             | text         | The full note. e.g., "Call to confirm if ordering more than 3 gluten-free platters." |
  | is_customer_visible | boolean      | Default false. If true, this note may be displayed on customer-facing menus.         |
  | sort_order          | int          | Display ordering among soft rules on this item. Default 0.                           |
  | created_at          | timestamptz  |                                                                                      |
  | updated_at          | timestamptz  |                                                                                      |

- Index on `menu_item_id` for efficient lookups.
- No uniqueness constraint on label — an item could have multiple soft rules with the same label (though unusual).
- Migration is reversible.

**Size:** S

**Notes:**

- Soft rules are always display-only. They will never be machine-enforced directly. However, they can trigger a review gate at the org level (see Story 7.1).
- The `is_customer_visible` flag controls whether this note can appear on customer-facing output (menus, order confirmations). Internal-only notes (default) are visible only to org staff in the management UI.
- As usage patterns emerge, recurring soft rule themes (e.g., many caterers writing cancellation policies) become candidates for promotion to the `menu_item_rule_type` enum as hard rules.

---

## 2. API Changes

### Story 1.6: Menu Item Rules CRUD (Backend) - complete

**As** the system, **I want** API endpoints to manage hard rules on menu items **so that** the frontend can display and edit item-level constraints.

**Acceptance Criteria:**

- `GET /api/menu-items/:id` includes a `rules` array in the response, each entry containing `rule_type` and `value`. Also includes a `soft_rules` array (see Story 1.8).
- `PUT /api/menu-items/:id/rules` accepts an array of `{ rule_type, value }` objects and replaces all hard rules for the item (full replacement, not patch). This simplifies the frontend — it sends the complete rule set on save rather than managing individual add/remove calls.
- Validation on write:
  - `rule_type` must be a valid `menu_item_rule_type` enum value. The database enforces this; the API returns 422 with a clear message for unrecognized types.
  - `value` must be valid for its type: positive integer for `min_quantity`, `max_quantity`, `order_multiple`; non-negative integer for `lead_time_hours`. Invalid values return 422 with a message identifying the rule and the problem.
  - `min_quantity` must be ≥ 1 if present. `max_quantity` must be ≥ `min_quantity` if both are present.
- `DELETE /api/menu-items/:id/rules` clears all hard rules for the item (convenience endpoint; the PUT with an empty array achieves the same result).

**Size:** S

---

### Story 1.8: Menu Item Soft Rules CRUD (Backend) - complete

**As** the system, **I want** API endpoints to manage soft rules on menu items **so that** caterers can attach freetext notes and constraints that our hard rule types don't cover.

**Acceptance Criteria:**

- `GET /api/menu-items/:id` includes a `soft_rules` array in the response, each entry containing `id`, `label`, `content`, `is_customer_visible`, and `sort_order`.
- `PUT /api/menu-items/:id/soft-rules` accepts an array of soft rule objects and replaces all soft rules for the item (full replacement, same pattern as hard rules).
- Each soft rule object: `{ label, content, is_customer_visible, sort_order }`. `label` and `content` are required. `is_customer_visible` defaults to false. `sort_order` defaults to 0.
- Validation: `label` max 100 characters, `content` max 2000 characters. Return 422 on violation.
- `DELETE /api/menu-items/:id/soft-rules` clears all soft rules for the item.
- `GET /api/menu-items` (list endpoint) includes a `soft_rule_count` integer per item (not the full soft rules) to keep the list response lightweight. The full soft rules are only on the detail endpoint.

**Size:** S

---

### Story 1.7: Menu Item Additional Fields in CRUD (Backend) - complete

**As** the system, **I want** the existing menu item CRUD endpoints to support the new fields (sku, serving_description, dietary_tags, allergens) **so that** the frontend can display and edit them.

**Acceptance Criteria:**

- `POST /api/menu-items` and `PUT /api/menu-items/:id` accept the four new fields. All are optional.
- `GET /api/menu-items/:id` and `GET /api/menu-items` (list) include the four new fields in the response.
- SKU uniqueness is enforced: attempting to create or update an item with a SKU that already exists in the org returns 409.
- SKU is trimmed of leading/trailing whitespace on write. Empty string is treated as null.

**Size:** S

---

### Story 3.2a: Column Mapping & Validation — Modifier Group, Rule & Soft Rule Support (Backend)

**As** the system, **I want** the CSV mapping endpoint to accept modifier group bundle definitions, hard rule column mappings, and soft rule column mappings **so that** the backend can parse grouped columns into structured modifier group data, individual columns into item rules, and freetext columns into soft rules.

**Acceptance Criteria:**

- The mapping payload (POST `/api/imports/csv/:session_id/map`) accepts a `modifier_group_bundles` array in addition to the existing `required` and `optional` field maps. Each bundle contains:
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
- The mapping payload also accepts a `rule_mappings` object mapping rule types to column names:
  ```json
  {
    "min_quantity": "MinOrder",
    "lead_time_hours": "LeadTimeHours"
  }
  ```
- The mapping payload also accepts a `soft_rule_mappings` array, each mapping a column to a soft rule label:
  ```json
  [
    { "column": "Notes", "label": "Operator Notes" },
    { "column": "AvailabilityDays", "label": "Availability" }
  ]
  ```
- For each row, the backend parses each modifier group bundle into a structured modifier group: `{ name, min_selections, max_selections, options: [{ name, price_adjustment }] }`.
- For each row, the backend parses each rule mapping into: `{ rule_type, value }`. Rows where the rule column is empty or `NULL` skip that rule (no error).
- For each row, the backend parses each soft rule mapping into: `{ label, content }`. Rows where the column is empty or `NULL` skip that soft rule (no error). `is_customer_visible` defaults to false for all imported soft rules.
- Rows where the modifier group name column is empty or `NULL` skip that modifier group bundle (no error).
- Pricing parsing: splits on delimiter, then splits each token on `:`. Token without `:` defaults to price 0. Price values are parsed as cents (integer).
- Validation errors returned per-row: unparseable price values, min > max on modifier groups, mismatched choice/pricing counts, invalid rule values (e.g., non-integer for min_quantity).
- The validated preview response includes the resolved modifier groups, rules, and soft rules per item.

**Size:** M

---

### Story 3.3a: CSV Import Commit — Modifier Group Deduplication (Backend)

**As** the system, **I want** to deduplicate modifier groups during import **so that** identical option sets aren't created multiple times.

**Acceptance Criteria:**

- During commit, before creating a modifier group, compute a structural fingerprint: lowercase group name + sorted list of (lowercase option name, price in cents) pairs.
- Check if a modifier group with the same fingerprint already exists in the org (either from a previous import or from earlier in the current import batch).
- If a match exists, reuse it — create a `menu_item_modifier_group` join record pointing to the existing group.
- If no match, create a new modifier group and its options, then create the join record.
- The import summary includes: `modifier_groups_created` and `modifier_groups_reused` counts.
- All fingerprint matching is case-insensitive.

**Size:** M

---

## 3. CSV Import Wizard — Revised Frontend Stories

These stories replace **Story 3.4** in its original form. The original Story 3.4 defined a single five-step wizard. The revised version breaks it into discrete, independently estimable stories, expands the modifier group handling into an explicit column-grouping interaction, and adds a saved-mapping feature.

---

### Story 3.4a: CSV Import Wizard — Upload & Preview (Frontend)

**As** an org admin, **I want** to upload a CSV file and see a preview of my data **so that** I can confirm I've selected the right file before proceeding.

**Acceptance Criteria:**

- User selects a CSV file via file picker or drag-and-drop.
- File is parsed entirely client-side (Papa Parse or equivalent). No server upload at this step.
- Preview displays: file name, total row count, and a scrollable table of the first 10 rows with all columns visible.
- Column headers are displayed verbatim from the CSV — no renaming or interpretation.
- Validation: rejects non-CSV files, empty files, and files exceeding 5MB with a clear error message.
- "Next" button proceeds to column mapping. "Cancel" returns to the menu item list.

**Size:** S

---

### Story 3.4b: CSV Import Wizard — Required & Optional Field Mapping (Frontend)

**As** an org admin, **I want** to map my CSV columns to the system's required and optional fields **so that** the system knows which column contains the item name, price, description, etc.

**Acceptance Criteria:**

- Displays all CSV column headers from the uploaded file.
- **Required fields** section: Item Name, Base Price. Each has a drop-down (or drag target) where the user assigns a CSV column. These must be filled to proceed.
- **Optional fields** section: Description, Category/Section, Price Unit, Serving Size, SKU / Item Code, Dietary Tags, Allergens, Sort Order. Each is a drop-down (or drag target). All are skippable.
- A column can only be assigned to one field. Assigning it removes it from the available pool for other fields.
- Each mapped field shows a 3-row data preview from the CSV so the user can verify the mapping is correct (e.g., they didn't accidentally map Description to Price).
- Unmapped columns are tracked and carried forward to the next step.
- "Back" returns to upload. "Next" proceeds to the column grouping step. "Next" is disabled until all required fields are mapped.

**Size:** M

---

### Story 3.4c: CSV Import Wizard — Column Grouping for Modifier Groups & Rules (Frontend)

**As** an org admin, **I want** to bundle my remaining unmapped columns into modifier groups and map individual columns as item rules **so that** the system can import my item options, choices, pricing, and constraints correctly.

**Acceptance Criteria:**

- Displays all unmapped columns remaining after Story 3.4b.
- Introductory text explains the purpose plainly, e.g.: _"Some of your columns may work together to describe item options — like a group name, available choices, and price adjustments. You can bundle those columns together so we import them correctly."_

**Modifier group bundling:**

- **"Create a modifier group bundle"** button adds a new grouping card. Each card has labeled slots:
  - **Group Name** (required) — which column contains the modifier group name for each row.
  - **Choices** (required) — which column contains the available options (e.g., `White|Wheat|Gluten-Free`).
  - **Pricing** (optional) — which column contains price adjustments for each choice.
  - **Min Selections** (optional) — which column contains the minimum required selections. Defaults to 0 if unmapped.
  - **Max Selections** (optional) — which column contains the maximum allowed selections. Defaults to unlimited (or the number of choices) if unmapped.
- Columns are assigned to slots via drop-down or drag-and-drop from the unmapped pool. Assigning a column to a slot removes it from the pool.
- A grouping card can be removed, returning its columns to the pool.
- Multiple grouping cards can be created (e.g., one for `OptionGroup1*` columns, another for `OptionGroup2*` columns).
- Each grouping card shows a 2-3 row preview of the bundled data so the user can verify the columns make sense together.

**Rule mapping:**

- After modifier group bundling, any remaining unmapped columns can be individually mapped as **hard rules** or **soft rules**.
- Hard rule mapping: the user selects "Map as Rule" → picks a rule type from a dropdown (`min_quantity`, `max_quantity`, `lead_time_hours`, `order_multiple`). The column values become the rule values.
- Soft rule mapping: the user selects "Map as Note" → provides a label (or the column header is used as the default label). The column values become soft rule content per item. Rows with empty values in that column produce no soft rule for that item.
- A mapped column is consumed from the remaining pool.

**Completion:**

- Remaining unmapped columns after grouping, rule mapping, and note mapping are presented with the option to **skip** them (they will not be imported).
- "Back" returns to field mapping. "Next" proceeds to preview. User may proceed with zero modifier group bundles, zero rules, and zero notes (skip all remaining columns).

**Size:** L

**Implementation Notes:**

- The delimiter within choice/pricing columns (e.g., `|` in `White|Wheat|Gluten-Free`) should be auto-detected from the data but user-overridable. Common delimiters: `|`, `;`, `/`.
- The pricing column format (e.g., `White:0|Wheat:0|Gluten-Free:10`) pairs choice names with prices. The parser should split on the delimiter, then split each token on `:` to extract name:price pairs. If no `:` is found, treat as price 0.

---

### Story 3.4d: CSV Import Wizard — Preview & Confirm (Frontend)

**As** an org admin, **I want** to see exactly what will be imported before I commit **so that** I can catch mistakes and feel confident in the result.

**Acceptance Criteria:**

- Displays a structured preview of all items as they will be created, organized by category/section if a category column was mapped.
- Each item shows: Name, Price (formatted), Description (truncated), SKU, serving description, dietary tags, allergens, rules, soft rules, and any modifier groups with their options and pricing.
- Modifier groups are displayed with their resolved name, min/max, and option list — e.g., _"Bread Choice (pick 1): White, Wheat, Gluten-Free (+$10.00)"_.
- Rules are displayed per item — e.g., _"Min Order: 12"_, _"Lead Time: 72 hours"_.
- Soft rules are displayed per item with their label and content.
- **Duplicate detection:** if two rows produce modifier groups with the same name AND the same option set (structural fingerprint), they are shown as a single shared group. If the same name but different options, they are shown as distinct groups — no warning, no merge prompt. This is expected behavior.
- **Row-level validation errors** are highlighted: missing required fields, unparseable prices, min > max on modifier groups, invalid rule values. Error rows are visually distinct and grouped at the top or in a collapsible error section.
- **Duplicate item detection:** if the CSV contains rows with the same Item Name (or Item Code if mapped), flag them. Show the user which rows conflict and let them choose: skip duplicates, or import all (creating separate items).
- Summary bar shows: total items, items with errors, modifier groups to be created, rules to be created.
- "Back" returns to column grouping. "Import" triggers the server-side commit (Story 3.3). "Import" is disabled if there are unresolved blocking errors (e.g., zero valid items).
- After successful import, shows a results screen: items created, items updated, modifier groups created, modifier groups reused (matched by structural fingerprint), rules created, and any row-level errors that were skipped.

**Size:** L

---

### Story 3.4e: CSV Import Wizard — Save & Reuse Column Mapping (Frontend + Backend)

**As** an org admin, **I want** my column mapping and grouping configuration to be saved **so that** I don't have to redo it every time I import from the same spreadsheet format.

**Acceptance Criteria:**

- After a successful import, the user is prompted: _"Save this column mapping for future imports?"_ with an optional name field (defaults to the CSV filename).
- Saved mapping stores: all field assignments from Story 3.4b, all modifier group bundles and rule mappings from Story 3.4c, and the detected choice delimiter.
- On subsequent CSV uploads (Story 3.4a), if saved mappings exist for the org, the user is offered: _"Use a saved mapping?"_ with a list of saved mappings showing name and date.
- If a saved mapping is selected AND the uploaded CSV's column headers match the mapping's expected columns, the wizard skips directly to Preview (Story 3.4d).
- If column headers don't match (columns added, removed, or renamed), the wizard notifies the user and falls back to the manual mapping flow, pre-filling any columns that do match.
- Saved mappings are org-scoped. CRUD: users can view, rename, and delete saved mappings from a settings area or from the import wizard.
- **Backend:** POST/GET/DELETE on `/api/orgs/:org_id/import-mappings`. Mapping stored as a JSONB blob. Schema defined in `menu_system_ddl.sql` (`import_mappings` table).

**Size:** M

---

## 4. Frontend Changes

### Story 4.2a: Menu Item Form — Hard Rules Section

**As** an org admin, **I want** to view and edit hard rules on a menu item **so that** I can define constraints like minimum order quantities and lead time requirements.

**Acceptance Criteria:**

- The menu item create/edit form (Story 4.2) includes a "Rules" section below the modifier groups section.
- "Add a rule" button presents a dropdown of available rule types (filtered to exclude types already added to this item).
- Each rule displays as a row: rule type label (human-readable, e.g., "Minimum Order Quantity") and a value input appropriate to the type (number input for quantity/time rules).
- Rules can be removed with a delete button on each row.
- Rule type labels and help text:
  - `min_quantity`: "Minimum Order Quantity" — _"The smallest number of this item a customer can order."_
  - `max_quantity`: "Maximum Order Quantity" — _"The largest number of this item a customer can order."_
  - `lead_time_hours`: "Lead Time (Hours)" — _"How much advance notice is needed for this item."_
  - `order_multiple`: "Order In Multiples Of" — _"This item must be ordered in multiples of this number."_
- Validation: enforces the same rules as the backend (positive integers, max ≥ min). Inline error messages on invalid input.
- Rules are saved as part of the overall item save — not a separate save action.

**Size:** S

---

### Story 4.2c: Menu Item Form — Soft Rules Section

**As** an org admin, **I want** to add freetext notes and constraints to a menu item **so that** I can capture rules and information that don't fit the predefined rule types.

**Acceptance Criteria:**

- The menu item create/edit form includes a "Notes & Custom Rules" section below the hard rules section.
- "Add a note" button adds a new entry with: **Label** (short text input, placeholder: _"e.g., Cancellation Policy, Seasonal Note"_), **Content** (textarea, placeholder: _"e.g., Call to confirm if ordering more than 3 gluten-free platters."_), and a **Customer Visible** toggle (default off, with help text: _"If on, this note may appear on customer-facing menus."_).
- Entries can be removed and reordered (drag or up/down controls).
- Soft rules are saved as part of the overall item save — not a separate save action.
- The section header includes a subtle info note: _"These notes are for information that doesn't fit the standard rules above. They won't be automatically enforced but will be visible to your team."_

**Size:** S

---

### Story 4.2b: Menu Item Form — Additional Fields

**As** an org admin, **I want** to view and edit SKU, serving description, dietary tags, and allergens on a menu item **so that** I can capture the full detail of my menu items.

**Acceptance Criteria:**

- The menu item create/edit form includes the following fields:
  - **SKU / Item Code**: text input, in the item header/details section near the item name.
  - **Serving Description**: text input, near the price section. Placeholder: _"e.g., Serves 10-12, 1 cup"_.
  - **Dietary Tags**: text input, in a "Dietary & Allergen Info" subsection. Placeholder: _"e.g., vegetarian; contains dairy; contains gluten"_.
  - **Allergens**: text input, same subsection. Placeholder: _"e.g., gluten; dairy; fish"_.
- All fields are optional.
- SKU field shows an inline error if the value conflicts with an existing item's SKU in the org (on blur or on save, based on the 409 response).

**Size:** S

---

## 5. Estimation Summary

| Story                                                   | Size | Notes                                                            |
| ------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| **Schema**                                              |      |                                                                  |
| 6.1a Relax modifier group name constraint               | S    | Drop unique constraint, add non-unique index                     |
| 6.1b Menu item rules table                              | S    | Single table, enum type, one constraint, one index               |
| 6.1c Additional item fields                             | S    | Four columns, one partial unique index                           |
| 6.1d Menu item soft rules table                         | S    | Single table, one index, freetext notes                          |
| **Backend API**                                         |      |                                                                  |
| 1.6 Hard rules CRUD                                     | S    | Simple nested resource, full-replacement PUT                     |
| 1.7 Additional fields in item CRUD                      | S    | Extend existing endpoints                                        |
| 1.8 Soft rules CRUD                                     | S    | Same pattern as 1.6, freetext validation only                    |
| 3.2a CSV mapping — modifier bundles, rules & soft rules | M    | Parsing logic, validation, new payload shape                     |
| 3.3a CSV commit — modifier group dedup                  | M    | Fingerprint computation, lookup, conditional create              |
| **Frontend — CSV Import Wizard**                        |      |                                                                  |
| 3.4a Upload & Preview                                   | S    | Client-side parsing, simple UI                                   |
| 3.4b Required/Optional Mapping                          | M    | Drop-down or drag-and-drop mapping, data preview                 |
| 3.4c Column Grouping & Rule Mapping                     | L    | Bundling cards, drag-and-drop, delimiter detection, rule mapping |
| 3.4d Preview & Confirm                                  | L    | Structured preview, fingerprint dedup display, error handling    |
| 3.4e Save & Reuse Mapping                               | M    | JSON blob persistence, column header matching                    |
| **Frontend — Item Form**                                |      |                                                                  |
| 4.2a Hard rules section                                 | S    | Dynamic form rows, dropdown, number inputs                       |
| 4.2b Additional fields                                  | S    | Four text inputs added to existing form                          |
| 4.2c Soft rules section                                 | S    | Label/content/toggle entries, reorderable                        |

**Net change from original story set:** Story 3.4 (single L) is replaced by 3.4a–e + 3.2a + 3.3a. This adds scope, but the original 3.4 was underestimated — it was an L that should have been an XL. The breakout makes the work plannable and parallelizable (backend stories 3.2a and 3.3a can proceed independently of the frontend wizard stories).

---

## 6. Deferred Concerns

The following data points were identified in the synthetic CSV but deliberately excluded from menu management scope. They will be revisited when order management comes online:

- **Taxable** — depends on jurisdiction (store location), not just the item.
- **Setup Available / Setup Fee** — order-level service decision, not a menu item property.
- **Deposit Required** — order/payment concern; may depend on order size or customer relationship.
- **Utensils Included** — operational fulfillment metadata.
- **IncludedWith** (cross-item relationships, e.g., "Bagel Box includes Coffee Service") — bundle/upsell concept; order-time concern.
- **Availability Days / Unavailable Dates** — scheduling constraint that intersects with order management and store hours.

---

## 7. Future Stories (Noted, Not Scoped)

These are not part of the current work but are recorded here so they don't get lost.

### Story 7.1 (Future): Org-Level Soft Rule Review Gate

When order placement is implemented, an org-level setting could flag orders containing items with soft rules for manual review before confirmation. The soft rule itself doesn't enforce anything — it triggers a review gate. This gives caterers a safety net for custom constraints without us needing to understand the semantics of every possible note.

### Story 7.2 (Future): Soft Rule Promotion Pipeline

As usage patterns emerge across orgs, recurring soft rule themes (e.g., many caterers writing cancellation policies, deposit thresholds, seasonal availability) become candidates for promotion to the `menu_item_rule_type` enum as hard rules. This would involve: identifying common soft rule patterns (potentially via simple text analysis or manual review), proposing new enum values, migrating qualifying soft rules to hard rules during the schema migration. No automation needed initially — this is an operational process informed by data.
