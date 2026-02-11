# Stores UX — Epics, Stories, Acceptance Criteria (Exhaustive Draft)

This is written to be useful both as reference material and as an agentic coding plan.

---

## Glossary & assumptions

- **Org**: Tenant boundary / top-level governance context.
- **Store**: Operational context users “enter” to do work.
- **Role** (store-scoped): `admin`, `staff`, `accountant/read-only` (names adjustable).
- **Membership**: A user can belong to 0..N stores.
- **Status** (store): `active`, `paused`, `archived` (names adjustable).
- **Invariant**: **Organizations govern. Stores operate. Orders live inside stores. Admin never replaces entering a store.**

---

# Epic A — Navigation & Context Safety

### A1 — Stores nav item routes to Stores index

**Story**: As a signed-in user, when I click “Stores” in the main nav, I land on `/stores`.

- **Acceptance criteria**
  - Clicking “Stores” always routes to `/stores`.
  - If not authenticated, the user is redirected to sign-in.
  - The page title and header clearly indicate “Stores”.

### A2 — Store context is always visible inside store routes

**Story**: As a user inside a store, I always know which store I’m in.

- **Acceptance criteria**
  - All `/stores/:storeId/*` pages show a consistent header containing:
    - Store name
    - My role in that store (or “Read-only”)
    - A “Back to Stores” affordance
  - Store name updates correctly when navigating between stores.

### A3 — Unauthorized store access is blocked gracefully

**Story**: As a user, if I try to access a store I’m not a member of, I’m prevented and shown a helpful message.

- **Acceptance criteria**
  - Navigating to `/stores/:storeId/*` where I have no membership:
    - Returns a clear “No access to this store” state
    - Provides a CTA to return to `/stores`
  - No store-specific data is rendered in this case.
  - If the user is an org admin but not a store member, behavior follows your policy:
    - **Option 1 (recommended)**: Org admins implicitly have store access.
    - **Option 2**: Org admin still needs explicit store membership.
  - Whatever policy is chosen is applied consistently across UI and API.

### A4 — Deep links preserve return path

**Story**: As a user, when I navigate via deep link to a store subpage, I can return to where I was.

- **Acceptance criteria**
  - “Back” behavior returns to `/stores` (or prior location) sensibly.
  - If accessed from Today or notifications, a “Back” returns to the originating view when possible.

---

# Epic B — Stores Index (`/stores`)

### B1 — Member sees only stores they belong to

**Story**: As a non-admin, I see only my stores.

- **Acceptance criteria**
  - Stores list contains only stores where I’m a member.
  - No “Create store” CTA appears for non-admins.
  - No admin-only filters/actions appear for non-admins.

### B2 — Admin sees all stores in the org

**Story**: As an admin, I can view all stores for my org.

- **Acceptance criteria**
  - Stores list contains all stores in the org (active + archived based on filter).
  - Admin-only controls are visible (create, filters, etc.).

### B3 — Stores list supports search

**Story**: As a user, I can quickly find a store by name/location.

- **Acceptance criteria**
  - Search input filters stores by name and location/descriptor.
  - Search is client-side if the dataset is small; server-side if paginated.
  - Empty result shows a helpful state (“No stores match…”).

### B4 — Admin filter by status (All / Active / Archived)

**Story**: As an admin, I can filter stores by status.

- **Acceptance criteria**
  - Filter toggles update the visible list.
  - Filter state is reflected in the URL query string (e.g., `?status=active`) for shareable links.
  - Default is `active` (recommended) or `all` (acceptable)—but consistent.

### B5 — Stores list displays operational indicators

**Story**: As a user, I can see a quick “signal” for each store.

- **Acceptance criteria**
  - Each store row/card shows:
    - Name
    - Location/descriptor (if present)
    - Status badge
    - One or more operational stats (configurable), e.g.:
      - Orders today
      - Pending actions / notifications
  - If stats are unavailable, UI degrades gracefully (shows “—” or hides).

### B6 — Clicking a store enters the store (default Orders tab)

**Story**: As a user, clicking a store takes me into that store’s workspace.

- **Acceptance criteria**
  - Clicking a store routes to `/stores/:storeId` (or `/stores/:storeId/orders`).
  - The default tab is Orders.
  - The store header loads quickly and shows the store name.

### B7 — Empty state: no stores for member

**Story**: As a member with no stores, I see a helpful state.

- **Acceptance criteria**
  - Shows “You don’t have access to any stores yet.”
  - Provides a suggestion: “Ask an admin to invite you to a store.”
  - No admin CTAs appear.

### B8 — Empty state: admin has no stores

**Story**: As an admin with no stores, I can create my first store.

- **Acceptance criteria**
  - Shows “No stores yet.”
  - Shows “Create store” CTA prominently.
  - Clicking CTA opens the create store flow.

### B9 — Single-store shortcut behavior (optional)

**Story**: As a user with exactly one store, I can get into work faster.

- **Acceptance criteria**
  - Either:
    - Auto-redirect from `/stores` → that store (configurable), OR
    - Strong “Enter” CTA and visual emphasis
  - Whatever behavior is chosen is consistent and doesn’t surprise users.

---

# Epic C — Create Store (Admin-only)

### C1 — Admin can open Create Store from Stores index

**Story**: As an admin, I can start creating a store from `/stores`.

- **Acceptance criteria**
  - “Create store” button exists only for admins.
  - Opening the flow uses modal or dedicated route:
    - `/stores/new` (recommended for deep linking) or modal.
  - Cancel returns to `/stores` with prior filters intact.

### C2 — Create Store: required fields and validation

**Story**: As an admin, I can create a store by providing minimal info.

- **Acceptance criteria**
  - Required: Store name
  - Optional: location/descriptor, hours, notes
  - Validation:
    - name is required, trimmed, reasonable length constraints
    - inline validation + disabled submit until valid
  - On submit success:
    - store is created
    - user is routed into the new store (Orders tab)
  - On submit failure:
    - error message is displayed and actionable

### C3 — Post-create default membership

**Story**: As an admin, after creating a store, appropriate membership is established.

- **Acceptance criteria**
  - The creating admin becomes a member of the store with admin role.
  - The store appears in `/stores` list.

---

# Epic D — Store Shell & Tabs (`/stores/:storeId/*`)

### D1 — Store shell loads and provides consistent tabs

**Story**: As a store member, I see the store shell with tabs.

- **Acceptance criteria**
  - Tabs: Orders, Team, Activity
  - Admin-only: Settings (and any other admin-only sections)
  - Active tab is highlighted.
  - Tabs are keyboard navigable and accessible.

### D2 — Role-based tab visibility

**Story**: As a user, I see only tabs I’m allowed to use.

- **Acceptance criteria**
  - Staff:
    - Orders, Team (read-only actions), Activity
    - No Settings
  - Accountant/read-only:
    - Orders (read-only), Activity
    - Team optional (read-only) depending on preference
  - Admin:
    - All tabs
  - If user navigates directly to a hidden tab route:
    - receives “Not allowed” state and is redirected to Orders (or shown 403)

### D3 — Store header includes role + status

**Story**: As a user, I can see store status and my role at a glance.

- **Acceptance criteria**
  - Header shows store status badge (Active/Paused/Archived).
  - Header shows role badge.
  - For archived stores, header warns “Archived: read-only” (recommended).

---

# Epic E — Orders Tab (Store-scoped)

> Even if Orders isn’t implemented yet, the tab scaffolding is part of the UX contract.

### E1 — Orders tab default view and subfilters

**Story**: As a user, I can view orders for this store via simple subfilters.

- **Acceptance criteria**
  - Subfilters: Today / Upcoming / All
  - Default subfilter: Today (recommended)
  - Changing subfilter updates URL query (e.g., `?view=today`)

### E2 — Orders list shows meaningful columns

**Story**: As a user, I can scan orders quickly.

- **Acceptance criteria**
  - Each row includes:
    - customer/name
    - date/time
    - status
    - assignee (if applicable)
    - payment status (if applicable)
    - total (if applicable)
  - Row is clickable to open order detail.

### E3 — Read-only behavior by role

**Story**: As a read-only user, I can view orders but not modify them.

- **Acceptance criteria**
  - Create/edit actions are hidden or disabled with tooltip.
  - Any attempt to perform write action via UI is blocked.

### E4 — Empty states

**Story**: As a user, when there are no orders in a view, I understand what to do.

- **Acceptance criteria**
  - Today view: “No orders today.”
  - All view: “No orders yet.” (Admin/staff may see “Create order” CTA if allowed.)

---

# Epic F — Team Tab (Store-scoped)

### F1 — Team list shows members and roles

**Story**: As a store member, I can see who is on the team.

- **Acceptance criteria**
  - List includes name, role, status.
  - Sorting by name default.
  - If user info is missing, shows a fallback label (e.g., email).

### F2 — Admin can invite a member to the store

**Story**: As an admin, I can invite someone to this store.

- **Acceptance criteria**
  - “Invite member” button visible to admins only.
  - Invitation form includes:
    - email (or user picker)
    - role for this store
  - On success: invite appears in “pending” state (either in Team tab or separate Invites subview).
  - On failure: actionable error shown.

### F3 — Admin can change a member’s store role

**Story**: As an admin, I can adjust someone’s role for this store.

- **Acceptance criteria**
  - Role dropdown/action visible to admins only.
  - Changing role updates immediately with optimistic UI or spinner.
  - Forbidden changes are blocked (e.g., removing the last admin if that rule exists).

### F4 — Admin can remove a member from the store

**Story**: As an admin, I can remove someone’s access to this store.

- **Acceptance criteria**
  - Remove action visible to admins only.
  - Requires confirmation.
  - After removal, user disappears from list.
  - If removing self, warns and requires extra confirmation.

### F5 — Team tab read-only for non-admins

**Story**: As staff, I can see the team but not manage it.

- **Acceptance criteria**
  - No invite/remove/role-change controls.
  - Contact details shown per privacy policy.

---

# Epic G — Activity Tab (Store-scoped)

### G1 — Activity feed renders chronological events

**Story**: As a user, I can see a timeline of important events.

- **Acceptance criteria**
  - Sorted newest-first (or oldest-first, but consistent).
  - Each event has:
    - human-readable description
    - actor
    - timestamp
  - Loading/pagination supported (infinite scroll or paging).

### G2 — Filter activity by event type (optional)

**Story**: As a user, I can filter the feed to what I care about.

- **Acceptance criteria**
  - Filters for: Orders, Team, Settings, Billing (if applicable)
  - Default: All
  - Filter state in URL query.

### G3 — Activity respects access boundaries

**Story**: As a user, I only see activity relevant to stores I can access.

- **Acceptance criteria**
  - No cross-store leakage.
  - If I lose access, I can no longer load the feed.

---

# Epic H — Store Settings (Admin-only)

### H1 — Admin can view and edit store details

**Story**: As an admin, I can edit store name/location/hours/notes.

- **Acceptance criteria**
  - Form fields load with current values.
  - Save persists changes and updates store header.
  - Validation + error handling.

### H2 — Pause a store (optional)

**Story**: As an admin, I can pause operations for a store without deleting it.

- **Acceptance criteria**
  - Paused stores show badge and can be filtered.
  - Paused store behavior defined:
    - Orders are read-only or creation disabled (choose one).
  - UI clearly indicates restrictions.

### H3 — Archive a store (danger zone)

**Story**: As an admin, I can archive a store to remove it from active operations.

- **Acceptance criteria**
  - Requires confirmation + typed store name (recommended).
  - Archived stores:
    - Appear in Archived filter
    - Become read-only
    - Cannot be entered for modifications (writes blocked)
  - Ability to unarchive (optional) is defined if desired.

---

# Epic I — Today (Cross-store) (Optional but recommended)

### I1 — Today shows grouped store summaries

**Story**: As a user with multiple stores, I can see today’s priorities across stores.

- **Acceptance criteria**
  - Grouped by store.
  - Each group shows:
    - # orders today
    - # pending actions/alerts
  - Clicking a store summary navigates into that store’s Orders tab with Today filter.

### I2 — Today respects membership boundaries

**Story**: As a user, Today only shows stores I can access.

- **Acceptance criteria**
  - Member sees only their stores.
  - Admin sees all stores (or configurable).

---

# Epic J — States, Errors, Performance, and Polish

### J1 — Loading skeletons / spinners

**Story**: As a user, loading states are predictable and do not “flash” confusingly.

- **Acceptance criteria**
  - Stores list shows skeleton placeholders during fetch.
  - Store shell shows header skeleton while loading store meta.
  - Tabs show local skeletons rather than blank screens.

### J2 — Empty states are specific and actionable

**Story**: As a user, empty screens tell me what to do next.

- **Acceptance criteria**
  - Each major list view has a tailored empty state.
  - Admin vs member empty states differ appropriately.

### J3 — Error states are actionable

**Story**: As a user, I understand what went wrong and how to recover.

- **Acceptance criteria**
  - Network error shows retry button.
  - Permission error shows “Return to Stores”.
  - Not found shows “Store not found” and return CTA.

### J4 — URL structure is consistent and shareable

**Story**: As a user, I can bookmark and share meaningful links.

- **Acceptance criteria**
  - `/stores`
  - `/stores/:storeId`
  - `/stores/:storeId/orders`
  - `/stores/:storeId/team`
  - `/stores/:storeId/activity`
  - `/stores/:storeId/settings` (admin)
  - Filters use query strings rather than hidden state.

### J5 — Accessibility baseline

**Story**: As any user, the Stores experience is accessible.

- **Acceptance criteria**
  - Proper heading structure (h1, h2)
  - Tab navigation supports keyboard
  - Focus states are visible
  - Screen-reader labels for controls

---

# Epic K — Security/Authorization Contract (UI-facing)

### K1 — UI hides actions the user can’t perform

**Story**: As a user, I’m not teased with actions I can’t take.

- **Acceptance criteria**
  - Non-admin never sees create store button.
  - Non-admin never sees Settings tab.
  - Read-only users never see write actions.

### K2 — UI also handles server-side forbiddens safely

**Story**: As a user, if the server rejects an action, the UI fails safely.

- **Acceptance criteria**
  - 403/401 responses show a clear message and revert any optimistic UI.
  - No sensitive data is rendered after forbidden.

---

## Implementation notes (agent-friendly)

- Build **StoreShell** as a layout route so all store subpages share header+tabs.
- Keep Stores index “thin”: no settings panels, no heavy forms.
- Prefer URL-driven filters for reproducibility and easy debugging.
- Keep role and store context visible to reduce “I changed the wrong thing” errors.
