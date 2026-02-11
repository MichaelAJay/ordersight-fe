# Stores Members UI Synthesis (Implementation + Product Context)

Document Version: 1.0
Generated: 2026-02-09
Source References:

- `members-ui-stories.md` (Store Members UI sections)
- `Stores_Epics_Stories_Acceptance_Criteria.md`
- `Stores_Wireframe_Hierarchy.md`

---

## Purpose

This document merges the implementation-level detail of the **Store Members UI** with the product context and UX invariants from the **Stores** epics and wireframes. It is written as a build plan for frontend components with explicit backend dependencies and UX expectations.

A key correction applied here: **store-scoped roles as described in the Stores epic are incorrect** for the current scope. Store membership does not grant a distinct role; authorization remains org-scoped in Phase 1. Store membership is assignment only.

---

## Product Context & Invariants (Stores UX)

These are product-level requirements that shape all UI work below:

- **Organizations govern. Stores operate. Orders live inside stores. Admin never replaces entering a store.**
- **Store context is always visible** inside `/stores/:storeId/*` routes (store name + my role + back affordance).
- **Stores is primary in nav; Admin is meta.**
- **Store membership is explicit.** Users can belong to 0..N stores.
- **No cross-store leakage.** Store-scoped views never expose data from other stores.

Wireframe alignment:

- `/stores` is the operational entry point, not Admin.
- Store shell defines tabs: Orders, Team, Activity, Settings (admin only).
- The **Store Members table belongs under the Team tab**.

---

## Role + Authorization Model (Corrected)

**Org roles (authoritative, current scope):**

- `super_admin`, `admin`, `accountant`, `staff`

**Store membership (Phase 1):**

- A user is assigned to 0..N stores.
- Store membership **does not confer a separate store role** in Phase 1.
- **Store-scoped roles will exist, but are deferred.**
- Store views show the **org role badge** for context only.

**Implications:**

- Store Team actions that depend on store-specific roles are **out of scope** until store roles ship.
- Admin-gated actions are governed by org role only.

---

## Global UX Requirements (Stores epics)

The following are global behaviors that must remain true while implementing store members UI:

- Store routes (`/stores/:storeId/*`) must show store header with name + my role + back to stores - accomplished through nested components (parent component shows "always" details).
- Store access is blocked when the user is not a member. **Admins have auto-access** to all stores.
- Store shell uses tab routing and URL-driven filters where applicable.
- Loading, empty, and error states should be specific and actionable.

---

## Backend Routes (Store Members)

- `GET /api/v1/stores/:storeId/members`
- `GET /api/v1/stores/:storeId/members/:id`
- `GET /api/v1/stores/:storeId/members/:id/orders`
- `GET /api/v1/stores/open-orders` (stubbed; returns Not Implemented)
- `POST /api/v1/notifications/send`
- `POST /api/v1/members/:id/store-assignments`
- `DELETE /api/v1/members/:id/store-assignments/:storeId`

---

## Epic — Stores Landing + Store Shell (Foundational)

> Required to place the Store Members UI into the correct product flow.

### FE-STORES-001: Stores Landing Page (`/stores`)

**Status:** ✅ Complete (FE) — landing page, search + admin filters, role-based visibility, single-store auto-enter, empty/error states, open-orders badge with Not Implemented fallback (backend stub added).

- Shows stores list with role-based visibility (members see only their stores, admins see all) and search/filters
- Does **not** show role badges on the landing page
- Shows **Open Orders** as a badge per store (see Stores core doc)
- If a **non-admin** user has exactly **one store**, auto-enter that store
- Otherwise, require explicit click to enter a store
- Empty states differ for admins vs members
- Fetches open orders via `GET /api/v1/stores/open-orders`
- Backend endpoint is stubbed and returns **Not Implemented**
- Frontend treats Not Implemented as an **unexpected** error and degrades gracefully (badge hidden or shown as `—`, no hard error state)

### FE-STORES-002: Store Shell + Tabs

**Status:** ✅ Complete (shell + tabs + access guard; placeholder tab content)

- Store header always visible with store name + my org role + back to stores
- Tabs: Orders, Team, Activity, Settings (admin only)
- Access guard: non-members see “No access to this store” state; admins have auto-access

---

## Epic — Store Members UI (Team Tab)

> Store members live under `/stores/:storeId/team` as per store shell and wireframes.

### FE-STORE-MEMBERS-001: Store Members Table

- **Placement:** Team tab within store shell
- Shows members assigned to current store only
- Columns: Member, Org Role, Status, Last Active, Contact
- Search + filter by org role
- Row click opens Store Member Drawer
- Admin viewers see checkboxes + bulk send notification
- Store Team management actions are **assignment-based** (admin assigns org members to store) — no invites, no store role changes

### FE-STORE-MEMBERS-002: Store Member Drawer

- Drawer shell reusing shared member drawer layout
- Tabs: Profile & Orders, Notifications
- Header shows name, org role badge, status
- Kebab menu **admin-only** with “Send Notification” shortcut only
- This drawer is shown **inside the store-specific view** (Team tab)

### FE-STORE-MEMBERS-003: Profile & Orders Tab

- Reuses `MemberProfileBase` (shared read-only profile section)
- “Member since” = store assignment date
- Orders list: store-scoped orders assigned to this member

### FE-STORE-MEMBERS-004: Notifications Tab

- Reuses shared notification components from the store members flows

### FE-STORE-MEMBERS-005: Assign Org Member to Store (Admin)

- Admin-only action from Team tab
- Assigns existing org members to the current store
- No invite flow, no store role selection
- Supports add/remove with confirmation and optimistic UI

---

## Store Shell + Navigation Requirements (Non-Component, Still Required)

These are not direct component stories, but must be satisfied as part of implementing the store members UI within the Store shell:

- **Stores landing page (`/stores`)** is required. **Status: ✅ Complete.** Behavior:
  - If a non-admin user has exactly one store, auto-enter that store.
  - Otherwise, show the stores list and require an explicit click to enter.
- `/stores` index page with role-based visibility and search/filters. **Status: ✅ Complete.**
- Store shell layout with tabs (Orders, Team, Activity, Settings admin-only). **Status: ✅ Complete (tabs scaffolded).**
- Store header always visible with store name + my org role. **Status: ✅ Complete.**
- “No access to store” and error states. **Status: ✅ Complete.**

---

## Decisions Locked (For Now)

1. **Store-scoped roles are deferred**
   - Phase 1 uses org roles only. Ensure no UI implies store role assignment yet.

2. **Team tab management actions**
   - Store Team uses **assignment**, not invites. Role changes are out of scope until store roles ship.

3. **Store member drawer**
   - Confirmed: drawer exists in the store-specific Team view.

---

## Suggested Implementation Order

1. Stores landing page (`/stores`)
2. Store shell + Team tab routing scaffold
3. `MemberProfileBase` (shared)
4. Store Members table (Team tab)
5. Store Member drawer shell + Profile & Orders tab
6. Notifications tab + bulk actions
7. Assign org member to store (admin)

---

## Notes

- Store-level permissions are explicitly out of scope for Phase 1. This synthesis adheres to that constraint.
- All store-scoped data views must validate membership and prevent cross-store leakage.
- Do not introduce new store-specific role labels until a decision is made in the conflicts section.
