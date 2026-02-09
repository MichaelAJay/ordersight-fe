# Members & Store Members UI

## Frontend Stories with Backend Route Dependencies

### JIRA-Ready Stories & Acceptance Criteria

**Phase 1 — MVP Foundation (Frontend)**

Document Version: 1.0
Generated: 2026-02-07

---

## Overview

This document defines the frontend stories for two related views: the **Organization Members** page (admin-scoped) and the **Store Members** table (store-scoped). Each frontend story references the backend route(s) it depends on, with embedded acceptance criteria for those routes where they don't already exist in the backend backlog.

### Governing Principles

1. **Bulk actions live on the table; single-member actions live in the drawer.**
2. **The drawer uses internal tabs** to separate concerns (Profile, Activity, Notifications) without overwhelming a single scroll.
3. **Store-scoped views never leak cross-store data.** A store member drawer shows only what is relevant to the selected store.
4. **A reusable `MemberProfileBase` section** is shared between the admin and store drawers. The admin drawer _extends_ the base; the store drawer consumes it read-only.
5. **Self-view is safe.** When a user opens their own drawer, destructive actions are disabled with explanatory tooltips — not hidden.

### Scope Boundaries

- **Invites** are handled by a separate "Invites" tab on the Members page; only bulk actions in FE-MEMBERS-002b are in scope here.
- **Internal notification system** is not yet built. Notification stories here cover email-only, with the component structure designed to support internal notifications later.
- **Store-level permissions (Phase 2)** are not in scope. Store membership here means assignment, not authorization.

### New Backend Routes Required

The existing backend backlog (EPIC-004, STORY-027–030) covers basic member CRUD. This document introduces additional routes not yet in the backlog:

| Route                                                   | Method | Purpose                         | Existing?                    |
| ------------------------------------------------------- | ------ | ------------------------------- | ---------------------------- |
| `GET /api/v1/members/summary`                           | GET    | List org members + invite count | STORY-027 (needs pagination) |
| `GET /api/v1/members/:id`                               | GET    | Single member detail            | **New**                      |
| `PATCH /api/v1/members/:id/role`                        | PATCH  | Update role                     | STORY-028                    |
| `PATCH /api/v1/members/:id/email`                       | PATCH  | Update primary email            | **New**                      |
| `PATCH /api/v1/members/:id/status`                      | PATCH  | Suspend / unsuspend             | **New**                      |
| `DELETE /api/v1/members/:id`                            | DELETE | Remove member                   | STORY-029                    |
| `GET /api/v1/members/:id/audit`                         | GET    | Member audit log                | **New**                      |
| `POST /api/v1/members/:id/force-reauth`                 | POST   | Revoke sessions                 | **New**                      |
| `POST /api/v1/notifications/send`                       | POST   | Send email notification         | **New**                      |
| `GET /api/v1/stores/:storeId/members`                   | GET    | List store members              | **New**                      |
| `GET /api/v1/stores/:storeId/members/:id`               | GET    | Store member detail             | **New**                      |
| `GET /api/v1/stores/:storeId/members/:id/orders`        | GET    | Member's orders at store        | **New**                      |
| `POST /api/v1/members/:id/store-assignments`            | POST   | Assign member to store          | **New**                      |
| `DELETE /api/v1/members/:id/store-assignments/:storeId` | DELETE | Remove store assignment         | **New**                      |
| `GET /api/v1/members/:id/store-assignments`             | GET    | List member's store assignments | **New**                      |
| `POST /api/v1/members/export`                           | POST   | Export members list             | **New**                      |

---

## Epic: Organization Members UI

**Initiative:** INIT-001

**Description:** Build the admin-facing Organization Members page with paginated table, member detail drawer with tabbed layout, and member management actions.

**RTM Refs:** AUTH-4, AUTH-5, AUTH-6, SEC-4

---

### FE-MEMBERS-001: Organization Members Table

| Points | Priority | Labels                          |
| ------ | -------- | ------------------------------- |
| 5      | Highest  | frontend, members, table, admin |

**Description:** Build the paginated members table on the Organization Members page. This is the primary view for admins managing their team, and the "Members" page should not be accessible to non-admin users.

**Component Structure:**

- `MembersPage` — page layout with tab bar (Members | Invites)
- `MembersTable` — RAC `Table` with `Column`, `Row`, `Cell`
- `MemberStatusBadge` — reusable badge for active/suspended
- `MemberRoleBadge` — reusable badge for role display

**Table Columns:**

| Column      | Content                                      | Sortable           | Notes                        |
| ----------- | -------------------------------------------- | ------------------ | ---------------------------- |
| Member      | Avatar/initials + full name                  | Yes (by last name) | Primary column               |
| Email       | Primary email                                | Yes                |                              |
| Role        | Badge: super_admin, admin, accountant, staff | Yes                |                              |
| Status      | Badge: active, deactivated                   | Yes                | Default filter: active only  |
| Last Active | Relative timestamp                           | Yes                | "2h ago", "3d ago", etc.     |
| Joined      | Date                                         | Yes                | `created_at` from membership |

**Acceptance Criteria:**

- [x] Table renders org members with all columns above
- [ ] Pagination: cursor-based, configurable page size (default 20)
- [ ] Default sort: last name ascending
- [ ] Default filter: status = active (toggle to include deactivated)
- [ ] Filter by role (multi-select)
- [ ] Search by name or email (debounced, 300ms)
- [x] Row click opens member drawer (FE-MEMBERS-003 - is placeholder)
- [x] Row visually distinguishes the current user ("You" label or subtle highlight)
- [ ] Empty state when no members match filters
- [x] Loading skeleton while fetching

**Backend Dependency — `GET /api/v1/members/summary`:**

This route exists as STORY-027 but needs the following additions. It is a super-route of
`GET /api/v1/members` (includes all member list data plus summary metadata for page badges).

- [ ] Cursor-based pagination (keyset pagination on `(last_name, id)`)
- [ ] Query params: `?status=active`, `?role=admin,staff`, `?search=`, `?limit=20`, `?cursor=`
- [ ] Response includes `last_active_at` (from Clerk session metadata, synced periodically or on-demand)
- [ ] Response shape:
      `{ members: { data: Member[], next_cursor: string | null, total_count: number }, pending_invite_ct: number, active_member_ct: number, deactivated_member_ct: number }`
- [ ] `total_count` is the filtered total (for "Showing X of Y" UI text)
- [ ] Scoped by `org_id` (enforced by Org middleware)

---

### FE-MEMBERS-002a: Table Bulk Actions (Send Notification, Export)

| Points | Priority | Labels                                 |
| ------ | -------- | -------------------------------------- |
| 3      | High     | frontend, members, bulk-actions, admin |

**Description:** Implement row selection and bulk action toolbar on the members table. Only two bulk actions for MVP: Send Notification and Export.
**Status:** ✅ Complete

**Component Structure:**

- `BulkActionToolbar` — appears when 1+ rows selected, replaces/overlays table header
- `SendNotificationDialog` — RAC `Dialog` for composing message
- Uses RAC `Table` selection mode (`selectionMode="multiple"`)

**Acceptance Criteria:**

- [x] Checkbox column appears for admin+ roles
- [x] "Select all" checkbox in header selects current page
- [x] Bulk toolbar shows count: "3 members selected"
- [x] **Send Notification:** Opens dialog with subject + body fields, pre-populated "To" count, sends email to selected members
- [x] **Export:** Downloads CSV of selected members (or all if none selected), columns match table columns
- [x] Toolbar dismisses when selection cleared
- [x] Non-admin users do not see checkboxes or bulk actions

**Backend Dependency — `POST /api/v1/notifications/send` (New):**

- [ ] Accepts `{ recipient_ids: uuid[], subject: string, body: string, channel: "email" }`
- [ ] Validates all recipients are active org members
- [ ] Sends email via configured email provider (Clerk, SendGrid, etc.)
- [ ] Admin+ only (RequireAdmin middleware)
- [ ] Returns `{ sent_count: number, failed: uuid[] }`
- [ ] Logged to audit: action=`notification_sent`, metadata includes recipient count

**Backend Dependency — `POST /api/v1/members/export` (New):**

- [ ] Accepts `{ member_ids: uuid[] | null, filters: { status?, role?, search? } }`
- [ ] If `member_ids` is null, exports all matching filters
- [ ] Returns CSV file with Content-Disposition header
- [ ] Admin+ only
- [ ] Decrypts PII for export (email, name)
- [ ] Logged to audit: action=`member_export`

---

### FE-MEMBERS-002b: Invites Table Bulk Actions (Resend, Cancel)

| Points | Priority | Labels                                   |
| ------ | -------- | ---------------------------------------- |
| 2      | High     | frontend, members, bulk-actions, invites |

**Description:** Add row selection + bulk actions to the Invites tab table. Actions include Resend Invitations and Cancel Invitations.
**Status:** ✅ Complete

**Component Structure:**

- `OrgInvitesTable` — RAC `Table` with selection
- `BulkActionToolbar` — appears when 1+ invites selected

**Acceptance Criteria:**

- [x] Checkbox column appears for admin+ roles
- [x] "Select all" checkbox in header selects current page
- [x] Bulk toolbar shows count: "3 invites selected"
- [x] **Resend Invitations:** Resends selected pending invites, shows summary success/error message
- [x] **Cancel Invitations:** Confirms, then revokes selected pending invites and removes them from the table
- [x] Only pending invites are selectable (accepted/expired/revoked are disabled)
- [x] Toolbar dismisses when selection cleared
- [x] Non-admin users do not see checkboxes or bulk actions

**Backend Dependency — Existing Invites Routes:**

- [ ] `POST /api/v1/members/invites/:id/resend`
- [ ] `DELETE /api/v1/members/invites/:id`

---

### FE-MEMBERS-003: Member Drawer Shell (Admin)

| Points | Priority | Labels                           |
| ------ | -------- | -------------------------------- |
| 5      | Highest  | frontend, members, drawer, admin |

**Description:** Build the drawer component that opens when a member row is clicked. The drawer contains a sticky header with identity info and a tabbed body. This story covers the shell, header, and tab navigation only — tab content is in subsequent stories.

**Component Structure:**

- `MemberDrawer` — RAC `DialogTrigger` + custom drawer (slides from right)
- `MemberDrawerHeader` — sticky top section
- `MemberDrawerTabs` — RAC `Tabs`, `TabList`, `TabPanel`
- `MemberActionsMenu` — RAC `MenuTrigger` + `Menu` (kebab ⋯)

**Drawer Header Content:**

- Avatar (initials-based, or Clerk avatar URL if available)
- Full name (read-only, managed by user via Clerk)
- Role badge
- Status badge
- Kebab menu (⋯) for destructive/rare actions

**Tab Bar:**

- **Profile** — contact info, role, store assignments
- **Activity** — audit log timeline
- **Notifications** — sent notification log + send action

**Acceptance Criteria:**

- [x] Drawer opens from right side, width ~480px on desktop, full-width on mobile
- [x] Drawer animates open/close (slide + fade)
- [x] Header is sticky (does not scroll with tab content)
- [x] Clicking outside drawer or pressing Escape closes it
- [x] Tab selection persists while drawer is open (switching members resets to Profile tab)
- [x] Drawer fetches member detail on open (not pre-loaded from table data — stale risk)
- [x] Loading state shown while fetching
- [x] Kebab menu items vary based on: target's role, viewer's role, and whether target is self (see FE-MEMBERS-007)

**Backend Dependency — `GET /api/v1/members/:id` (New):**

- [x] Returns full member detail: user info (decrypted name, email), role, status, `created_at`, `last_active_at`, store assignments
- [x] Scoped by `org_id`
- [x] Non-member target returns 404
- [x] Includes `store_assignments: [{ store_id, store_name }]` (join through `store_memberships` → `stores`)
- [x] Includes `is_self: boolean` flag (compare `request.user_id == target.user_id`)

---

### FE-MEMBERS-004: Profile Tab — MemberProfileBase (Shared)

| Points | Priority | Labels                            |
| ------ | -------- | --------------------------------- |
| 3      | Highest  | frontend, members, drawer, shared |

**Description:** Build the reusable `MemberProfileBase` component that renders read-only contact information. This is used in both the admin drawer and the store member drawer. The admin drawer extends it with editable fields and management sections.

**Component Structure:**

- `MemberProfileBase` — read-only contact info section
  - `ContactInfoSection` — name, email, phone
  - `DetailRow` — label + value pair, optionally with edit action

**Fields Displayed:**

- **Name** — read-only always, with lock icon and tooltip: "Name is managed by the user in their account settings"
- **Email** — read-only in base; admin drawer overrides to make editable (FE-MEMBERS-005)
- **Last Active** — relative timestamp with exact date tooltip
- **Member Since** — formatted date

**Acceptance Criteria:**

- [x] Renders as a clean card/section with label-value rows
- [x] Name shows lock icon indicating it's user-managed
- [x] Exports `MemberProfileBase` for use in both admin and store drawers
- [x] Accepts `member` data prop — no internal fetching
- [x] Responsive: adjusts layout for narrow drawer width

---

### FE-MEMBERS-005: Profile Tab — Admin Extensions (Role, Email, Store Assignments)

| Points | Priority | Labels                           |
| ------ | -------- | -------------------------------- |
| 5      | High     | frontend, members, drawer, admin |

**Description:** Extend the Profile tab in the admin drawer with editable role, editable email, and store assignment management. These sections render below the `MemberProfileBase`.

**Component Structure:**

- `AdminProfileExtensions` — wraps admin-only sections
  - `RoleSelect` — RAC `Select` for role change
  - `EmailEditField` — inline edit with confirmation
  - `StoreAssignmentsList` — list of assigned stores with add/remove

**Section: Role**

- RAC `Select` showing current role
- Options filtered by `CanManageRole` rules: viewer cannot assign roles they can't manage
- super_admin role is never shown as an option (transfer is a separate flow)
- Saving triggers confirmation: "Change [Name]'s role to [Role]?"
- Disabled with tooltip when viewing self or viewing super_admin

**Section: Email**

- Displays current email with "Edit" button
- Clicking "Edit" reveals inline text input + Save/Cancel
- Saving triggers confirmation: "This will change [Name]'s login email. They will be notified."
- Validation: valid email format, not already in use in org

**Section: Store Assignments**

- List of stores with remove (×) button per store
- "Add to store" button opens a RAC `ComboBox` (searchable dropdown of org stores not already assigned)
- Changes are saved immediately (no bulk save)

**Acceptance Criteria:**

- [x] Role select only shows roles the current user can assign per `CanManageRole`
- [x] Role select disabled for super_admin target (tooltip: "Use Transfer Ownership to change the organization owner")
- [x] Role select disabled for self (tooltip: "You cannot change your own role")
- [x] Email edit validates format client-side before submit
- [x] Email edit shows server-side errors (duplicate, invalid)
- [x] Store assignments list is scrollable if many stores
- [x] Adding/removing store assignment updates immediately with optimistic UI + rollback on error
- [ ] All changes logged to audit on the backend

**Backend Dependency — `PATCH /api/v1/members/:id/email` (New):**

- [ ] Accepts `{ email: string }`
- [ ] Admin+ only (RequireAdmin middleware)
- [ ] Admins may update their own email through this endpoint
- [ ] Validates email format, checks uniqueness within org (via `email_norm_hash`)
- [ ] Updates Clerk user's primary email via Clerk Backend API
- [ ] Updates local encrypted PII + hash
- [ ] Logged to audit: action=`member_email_changed`, metadata includes old hash (not plaintext)
- [ ] Returns updated member

**Backend Dependency — `POST /api/v1/members/:id/store-assignments` (New):**

- [ ] Accepts `{ store_id: uuid }`
- [ ] Admin+ only
- [ ] Validates store belongs to org, member belongs to org
- [ ] Inserts into `store_memberships`
- [ ] Returns `201 Created` with assignment
- [ ] Idempotent: re-assigning returns 200 with existing assignment
- [ ] Logged to audit

**Backend Dependency — `DELETE /api/v1/members/:id/store-assignments/:storeId` (New):**

- [ ] Admin+ only
- [ ] Validates both store and member belong to org
- [ ] Deletes from `store_memberships`
- [ ] Returns 204 No Content
- [ ] Idempotent: deleting non-existent returns 204
- [ ] Logged to audit

**Backend Dependency — `GET /api/v1/members/:id/store-assignments` (New):**

- [ ] Returns `[{ store_id, store_name, assigned_at }]`
- [ ] Scoped by org_id
- [ ] Used by drawer to populate store assignment list

---

### FE-MEMBERS-006: Activity Tab — Audit Timeline (Admin)

| Points | Priority | Labels                                  |
| ------ | -------- | --------------------------------------- |
| 5      | High     | frontend, members, drawer, admin, audit |

**Description:** Build the Activity tab content showing an audit log timeline for the selected member. This is an admin-only tab for investigating member actions and security events.

**Component Structure:**

- `MemberAuditTimeline` — vertical timeline layout
  - `AuditTimelineEntry` — single entry with icon, timestamp, description
  - `AuditFilterBar` — category + date range filters
- Uses RAC `DateRangePicker` for date filtering
- Uses RAC `Select` for category filtering

**Timeline Entry Structure:**

- Category icon (color-coded): 🔐 auth, 📦 order, ⚙️ settings, 👤 membership, 🏪 store
- Timestamp (relative, with exact date on hover)
- Description: human-readable action ("Updated order #1234 status to 'confirmed'")
- Actor attribution (usually self, but could be admin action or system)

**Filter Categories:**

- **All** (default)
- **Security** — login, logout, failed auth, session revoked, email changed, role changed
- **Orders** — created, updated, status changed, assigned
- **Settings** — profile changes, store assignment changes
- **Membership** — role changes, suspension, removal

**Acceptance Criteria:**

- [ ] Timeline renders most recent entries first (reverse chronological)
- [ ] Default view: last 30 days, all categories
- [ ] Category filter narrows results
- [ ] Date range picker constrains timeline
- [ ] Infinite scroll or "Load more" pagination (20 entries per page)
- [ ] Empty state: "No activity matching filters"
- [ ] Loading skeleton on initial load and when filters change
- [ ] Entries link to relevant resources where applicable (e.g., order ID links to order detail — deferred if orders UI not built yet)

**Backend Dependency — `GET /api/v1/members/:id/audit` (New):**

- [ ] Returns paginated audit log entries for a specific member
- [ ] Query params: `?category=security,orders`, `?after=2026-01-01`, `?before=2026-02-01`, `?limit=20`, `?cursor=`
- [ ] Admin+ only (RequireAdmin middleware)
- [ ] Scoped by org_id
- [ ] Queries `audit_logs` where `actor_id = :id` OR `target_id = :id` (member appears as actor or target)
- [ ] Response: `{ data: AuditEntry[], next_cursor: string | null }`
- [ ] Each entry: `{ id, timestamp, action, actor_type, actor_id, actor_name, target_type, target_id, target_name, category, metadata }`
- [ ] `category` is derived from `action` (e.g., `member_role_changed` → `membership`, `order_created` → `orders`)
- [ ] `actor_name` and `target_name` resolved via joins (avoid N+1)

---

### FE-MEMBERS-007: Drawer Actions Menu (Suspend, Unsuspend, Remove, Force Re-auth)

| Points | Priority | Labels                                    |
| ------ | -------- | ----------------------------------------- |
| 5      | High     | frontend, members, drawer, admin, actions |

**Description:** Implement the kebab (⋯) actions menu in the drawer header. Actions are context-dependent based on the target member's role/status and the viewer's relationship to the target.

**Status:** In progress (backend + core UI done; audit logging + UX polish remaining)

**Component Structure:**

- `MemberActionsMenu` — RAC `MenuTrigger` + `Menu` + `MenuItem`
- `SuspendConfirmDialog` — RAC `AlertDialog`
- `RemoveConfirmDialog` — RAC `AlertDialog`
- `ForceReauthConfirmDialog` — RAC `AlertDialog`

**Action Matrix:**

| Action                  | Shown When                | Disabled When                         | Confirmation Required                                                                                            |
| ----------------------- | ------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Suspend Member          | target.status = active    | target is self, target is super_admin | Yes — "This will immediately log out [Name] and prevent access."                                                 |
| Unsuspend Member        | target.status = suspended | —                                     | Yes — "This will restore [Name]'s access to the organization."                                                   |
| Remove Member           | always                    | target is self, target is super_admin | Yes — "This will permanently remove [Name] from the organization. They will lose access to all stores and data." |
| Force Re-authentication | target.status = active    | target is self                        | Yes — "This will revoke all active sessions. [Name] will need to log in again."                                  |

**Acceptance Criteria:**

- [x] Kebab menu only appears for admin+ viewers
- [x] Menu items show/hide based on action matrix above
- [x] Disabled items show tooltip explaining why (e.g., "Cannot suspend the organization owner")
- [x] Suspend: sets member status to `disabled`, triggers Clerk session revocation
- [x] Unsuspend: sets member status to `active`
- [ ] Remove: deletes membership (with cascade), shows impact summary in dialog (store assignments shown; pending order assignments TBD)
- [x] Force Re-auth: revokes Clerk sessions without changing member status
- [ ] All actions show success toast on completion (currently inline status message)
- [x] All actions update drawer state (re-fetch member detail)
- [x] Self-view: kebab menu items that target self are disabled, not hidden

**Backend Dependency — `PATCH /api/v1/members/:id/status` (New):**

- [x] Accepts `{ status: "active" | "disabled" }`
- [x] Admin+ only
- [x] Cannot change super_admin status (check constraint will reject, but validate app-side too)
- [x] Cannot change own status
- [x] When suspending: calls Clerk Backend API to revoke all user sessions in this org
- [x] Logged to audit: action=`member_suspended` or `member_unsuspended`
- [x] Returns updated member

**Backend Dependency — `POST /api/v1/members/:id/force-reauth` (New):**

- [x] Admin+ only
- [x] Cannot target self
- [x] Calls Clerk Backend API to revoke all sessions for user
- [x] Does NOT change member status (member remains active)
- [x] Logged to audit: action=`member_sessions_revoked`
- [x] Returns `{ success: true }`

---

### FE-MEMBERS-008: Notifications Tab (Admin Drawer)

| Points | Priority | Labels                                   |
| ------ | -------- | ---------------------------------------- |
| 3      | Medium   | frontend, members, drawer, notifications |

**Description:** Build the Notifications tab in the admin member drawer. Shows history of notifications sent to this member and provides a "Send Notification" action targeting just this member.
**Status:** ✅ Complete

**Component Structure:**

- `MemberNotificationsTab` — tab content
  - `NotificationLog` — list of sent notifications
  - `SendNotificationAction` — button that opens `SendNotificationDialog` (reused from FE-MEMBERS-002a)

**Acceptance Criteria:**

- [x] Shows list of notifications previously sent to this member (reverse chronological)
- [x] Each entry: subject, date sent, channel (email), status (sent/failed)
- [x] "Send Notification" button at top opens the compose dialog, pre-populated with this member as sole recipient
- [x] Reuses `SendNotificationDialog` from bulk actions
- [x] Empty state: "No notifications sent to this member yet"
- [x] Pagination or "Load more" if history is long

**Backend Dependency:** Notification log retrieval is deferred — the `POST /api/v1/notifications/send` route from FE-MEMBERS-002a handles sending. A `GET /api/v1/members/:id/notifications` route will be needed but can ship as a fast-follow (the tab renders empty state until then).

---

## Epic: Store Members UI

**Initiative:** INIT-001

**Description:** Build the store-scoped members table and drawer for operational staff. Read-only contact info, current store orders, and single-member notification.

**RTM Refs:** STO-1, ORD-3

---

### FE-STORE-MEMBERS-001: Store Members Table

| Points | Priority | Labels                          |
| ------ | -------- | ------------------------------- |
| 3      | High     | frontend, store, members, table |

**Description:** Build the members table within the Store detail page. This shows only members assigned to the current store. Visible to all members of that store (not admin-gated).

**Table Columns:**

| Column      | Content                      | Sortable | Notes                    |
| ----------- | ---------------------------- | -------- | ------------------------ |
| Member      | Avatar/initials + full name  | Yes      |                          |
| Role        | Org role badge               | Yes      | Read-only, for context   |
| Status      | Badge: active, suspended     | Yes      | Default: active only     |
| Last Active | Relative timestamp           | Yes      |                          |
| Contact     | Email (+ phone if available) | No       | Operational quick-access |

**Acceptance Criteria:**

- [ ] Table renders only members assigned to this store (via `store_memberships`)
- [ ] No management columns (no checkboxes for non-admins)
- [ ] Admin viewers see checkboxes + bulk "Send Notification" action
- [ ] Row click opens store member drawer (FE-STORE-MEMBERS-002)
- [ ] Pagination: same pattern as org members table
- [ ] Search by name or email
- [ ] Filter by role
- [ ] Current user row highlighted subtly

**Backend Dependency — `GET /api/v1/stores/:storeId/members` (New):**

- [ ] Returns paginated list of store members (join `store_memberships` → `org_memberships` → `users`)
- [ ] Scoped by org_id AND store_id
- [ ] Validates requesting user is a member of this store OR is admin+ (admins can view any store's members)
- [ ] Query params: `?search=`, `?role=`, `?status=active`, `?limit=20`, `?cursor=`
- [ ] Response includes contact info (decrypted email, name) and `last_active_at`
- [ ] Does NOT include store assignments for other stores (cross-store isolation)

---

### FE-STORE-MEMBERS-002: Store Member Drawer

| Points | Priority | Labels                           |
| ------ | -------- | -------------------------------- |
| 5      | High     | frontend, store, members, drawer |

**Description:** Build the drawer that opens when a store member row is clicked. Simpler than the admin drawer — two tabs: Profile & Orders, and Notifications.

**Component Structure:**

- `StoreMemberDrawer` — drawer shell (reuses drawer animation/layout from `MemberDrawer`)
  - `StoreMemberDrawerHeader` — avatar, name, role badge, status badge (no kebab for non-admins; admin viewers see kebab)
  - `StoreMemberDrawerTabs` — RAC `Tabs`

**Tab Bar:**

- **Profile & Orders** — read-only contact info (MemberProfileBase) + current store orders
- **Notifications** — same structure as admin notifications tab

**Header:**

- Same visual structure as admin drawer header
- Kebab menu (⋯) only shown for admin+ viewers, containing: Send Notification (shortcut to Notifications tab compose action). No suspend/remove from store context — those are admin panel actions.

**Acceptance Criteria:**

- [ ] Drawer opens from right, same dimensions/animation as admin drawer
- [ ] Header shows name, role badge, status badge
- [ ] No kebab menu for non-admin viewers
- [ ] Admin viewers see kebab with "Send Notification" shortcut only
- [ ] Two tabs: "Profile & Orders", "Notifications"
- [ ] Fetches store-scoped member detail on open
- [ ] No cross-store information displayed anywhere

**Backend Dependency — `GET /api/v1/stores/:storeId/members/:id` (New):**

- [ ] Returns member detail scoped to this store
- [ ] Includes: name, email, role, status, `last_active_at`, `member_since` (store assignment date)
- [ ] Does NOT include other store assignments
- [ ] Scoped by org_id AND store_id
- [ ] Validates requesting user is a store member or admin+
- [ ] Returns 404 if target is not assigned to this store

---

### FE-STORE-MEMBERS-003: Profile & Orders Tab (Store Drawer)

| Points | Priority | Labels                                   |
| ------ | -------- | ---------------------------------------- |
| 5      | High     | frontend, store, members, drawer, orders |

**Description:** Build the first tab of the store member drawer. Renders the shared `MemberProfileBase` (read-only contact info) followed by a list of orders at this store assigned to or involving this member.

**Component Structure:**

- `StoreProfileAndOrdersTab` — tab content
  - `MemberProfileBase` — reused from FE-MEMBERS-004, read-only
  - `MemberStoreOrders` — list of recent/active orders at this store

**Profile Section:**

- Identical to `MemberProfileBase`: name (locked), email, last active, member since
- "Member since" here uses the `store_memberships.created_at` (when they were assigned to this store), not the org membership date

**Orders Section:**

- Header: "Orders at [Store Name]"
- List of orders where this member is the assignee, scoped to this store
- Each order row: order identifier/title, status badge, date, brief summary
- Default: active/today's orders first, then recent completed
- "View All" link navigates to orders page filtered by this member (deferred if orders UI not built)

**Acceptance Criteria:**

- [ ] `MemberProfileBase` renders read-only with correct data
- [ ] "Member since" uses store assignment date, not org join date
- [ ] Orders section shows only orders for this store assigned to this member
- [ ] Orders sorted: active first, then by date descending
- [ ] Maximum 10 orders shown, with "View all orders" link
- [ ] Empty state: "No orders assigned to [Name] at this store"
- [ ] Orders section shows loading skeleton independently of profile section

**Backend Dependency — `GET /api/v1/stores/:storeId/members/:id/orders` (New):**

- [ ] Returns paginated orders at this store involving this member
- [ ] Scoped by org_id AND store_id
- [ ] Filters: orders where assignee = member_id
- [ ] Query params: `?status=active`, `?limit=10`, `?cursor=`
- [ ] Validates requesting user is store member or admin+
- [ ] Response: `{ data: Order[], next_cursor: string | null }`
- [ ] Each order: `{ id, title/identifier, status, date, summary }`

---

### FE-STORE-MEMBERS-004: Notifications Tab (Store Drawer)

| Points | Priority | Labels                                          |
| ------ | -------- | ----------------------------------------------- |
| 2      | Medium   | frontend, store, members, drawer, notifications |

**Description:** Build the Notifications tab in the store member drawer. Same structure as the admin drawer's notifications tab. Shows notification history and provides send action.

**Acceptance Criteria:**

- [ ] Reuses `NotificationLog` and `SendNotificationAction` components from FE-MEMBERS-008
- [ ] Notification compose dialog pre-populates recipient as this member
- [ ] Notification history filtered to this member
- [ ] Works identically to admin drawer notifications tab

**Backend Dependency:** Same as FE-MEMBERS-008 — `POST /api/v1/notifications/send` for sending, future `GET /api/v1/members/:id/notifications` for history.

---

## Summary

### Story Point Totals

| Epic                    | Stories | Points |
| ----------------------- | ------- | ------ |
| Organization Members UI | 8       | 34     |
| Store Members UI        | 4       | 15     |
| **Total**               | **12**  | **49** |

### Suggested Implementation Order

| #   | Story                | Rationale                                                                        |
| --- | -------------------- | -------------------------------------------------------------------------------- |
| 1   | FE-MEMBERS-004       | MemberProfileBase — shared component, no dependencies beyond member detail route |
| 2   | FE-MEMBERS-001       | Members table — primary view, unlocks everything else                            |
| 3   | FE-MEMBERS-003       | Drawer shell — needed before any tab content                                     |
| 4   | FE-MEMBERS-005       | Profile tab admin extensions — core admin functionality                          |
| 5   | FE-MEMBERS-007       | Drawer actions — suspend/remove/force-reauth                                     |
| 6   | FE-MEMBERS-006       | Activity tab — audit timeline                                                    |
| 7   | FE-MEMBERS-002a      | Bulk actions — enhances table after core is solid                                |
| 8   | FE-MEMBERS-008       | Notifications tab — lower priority, can ship with empty state                    |
| 9   | FE-STORE-MEMBERS-001 | Store table — depends on store CRUD existing                                     |
| 10  | FE-STORE-MEMBERS-002 | Store drawer shell                                                               |
| 11  | FE-STORE-MEMBERS-003 | Profile & Orders tab — depends on orders existing                                |
| 12  | FE-STORE-MEMBERS-004 | Store notifications tab — reuses admin components                                |

### New Backend Routes Summary

All routes are org-scoped (behind Auth → Org → Billing middleware). Admin-only routes additionally use RequireAdmin middleware.

| Route                                            | Auth                   | New Story? |
| ------------------------------------------------ | ---------------------- | ---------- |
| `GET /members/:id`                               | Any member             | New        |
| `PATCH /members/:id/email`                       | Admin+                 | New        |
| `PATCH /members/:id/status`                      | Admin+                 | New        |
| `GET /members/:id/audit`                         | Admin+                 | New        |
| `POST /members/:id/force-reauth`                 | Admin+                 | New        |
| `POST /notifications/send`                       | Admin+                 | New        |
| `POST /members/export`                           | Admin+                 | New        |
| `GET /members/:id/store-assignments`             | Admin+                 | New        |
| `POST /members/:id/store-assignments`            | Admin+                 | New        |
| `DELETE /members/:id/store-assignments/:storeId` | Admin+                 | New        |
| `GET /stores/:storeId/members`                   | Store member or Admin+ | New        |
| `GET /stores/:storeId/members/:id`               | Store member or Admin+ | New        |
| `GET /stores/:storeId/members/:id/orders`        | Store member or Admin+ | New        |

---

_Document Version 1.0 — Members & Store Members UI Stories_
_Generated: 2026-02-07_

---

## TODO

- Deferred: Add client-side guard for `/members` (hide Members nav + restrict route to admin users).
