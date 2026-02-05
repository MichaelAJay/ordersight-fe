# Ordersight FE Implementation Plan (Backend API Coverage)

Source: `ordersight/tools/openapi.yaml`

## Admonishments

- [ ] Rely on first principles; specifically question cargo cult coding and justify choices with concrete requirements and constraints.
- [ ] Rely on well-established FE/React best practices, especially around data fetching, caching, error handling, and access control.

## Feature Sections and Endpoints

### Health & Readiness (Ops/Diagnostics)

- [ ] `GET /health` Liveness check. No auth.
- [ ] `GET /ready` Readiness check (DB). No auth.

### Org Bootstrap & Ownership

- [x] `POST /api/v1/bootstrap` Bootstrap org from Clerk JWT context. Auth required.
- [ ] `POST /api/v1/org/transfer-ownership` Transfer `super_admin` to another active member. Auth required, `super_admin` role.

### Members & Invitations

- [x] `GET /api/v1/members` List members. Auth required, roles: `accountant`, `staff`, `admin`, `super_admin`.
- [x] `POST /api/v1/members/invite` Invite member(s). Auth required, roles: `admin`, `super_admin`.
- [x] `PATCH /api/v1/members/{id}/role` Update member role. Auth required, roles: `admin`, `super_admin`.
- [x] `DELETE /api/v1/members/{id}` Remove member. Auth required, roles: `admin`, `super_admin`.

### Stores

- [ ] `GET /api/v1/stores` List stores. Auth required, roles: `accountant`, `staff`, `admin`, `super_admin`.
- [ ] `POST /api/v1/stores` Create store. Auth required, roles: `admin`, `super_admin`.
- [ ] `GET /api/v1/stores/{id}` Get store. Auth required; non-admins must belong to store or 404.
- [ ] `PATCH /api/v1/stores/{id}` Update store. Auth required, roles: `admin`, `super_admin`.
- [ ] `DELETE /api/v1/stores/{id}` Delete store. Auth required, roles: `admin`, `super_admin`.

### Store Memberships

- [ ] `POST /api/v1/stores/{id}/members` Add store member. Auth required, roles: `admin`, `super_admin`.
- [ ] `DELETE /api/v1/stores/{id}/members/{user_id}` Remove store member. Auth required, roles: `admin`, `super_admin`.

### Webhooks (Backend Only)

- [ ] `POST /api/webhooks/clerk` Clerk webhook receiver. No auth; Svix headers required. Not a UI feature.

## Tasks (JIRA-Style) With Acceptance Criteria

### FE-ORG-001 Bootstrap Orgs on First Login

Acceptance Criteria:

- [x] When a user signs in via Clerk and no org record exists, the UI triggers `POST /api/v1/bootstrap` with an empty body.
- [ ] On success, the UI caches `organization`, `membership`, `subscription`, and `user_id` from the response for session use.
- [ ] On `401` or `403`, the UI shows a blocking auth error and halts org-dependent calls.
- [ ] Bootstrap is idempotent: repeated logins do not break the UI flow.

### FE-MEM-001 Members Directory View

Acceptance Criteria:

- [x] UI lists members using `GET /api/v1/members` with pagination (`limit`, `offset`).
- [x] Each row renders member identity (name/email) and role/status from the response.
- [x] UI handles `403` by showing a “no access” state rather than a blank screen.
- [x] Empty state renders a clear message when `members` is empty.

### FE-MEM-002 Invite Members (Single and Batch)

Acceptance Criteria:

- [x] UI supports inviting one member and multiple members in a single request to `POST /api/v1/members/invite`.
- [x] For batch invites, UI surfaces per-invite `error` from the response without blocking success for others.
- [x] UI validates required fields (`email`, `role`) before submission.
- [x] UI handles `409` conflicts (seat limit, duplicate invite) with a user-visible explanation.

### FE-MEM-003 Update Member Role

Acceptance Criteria:

- [x] UI allows `admin`/`super_admin` to update role via `PATCH /api/v1/members/{id}/role`.
- [x] Role changes reflect immediately in the members list without full refresh.
- [x] UI blocks role changes for self if backend forbids (surface `403`).
- [x] UI validates that `role` is one of `super_admin`, `admin`, `staff`, `accountant`.

### FE-MEM-004 Remove Member

Acceptance Criteria:

- [x] UI allows `admin`/`super_admin` to remove a member via `DELETE /api/v1/members/{id}`.
- [x] UI confirms destructive action before deletion.
- [x] UI handles `404` with a soft refresh and a message that the member no longer exists.

### FE-STORE-001 Store List

Acceptance Criteria:

- [ ] UI lists stores via `GET /api/v1/stores`.
- [ ] UI handles `403` by showing an access denial state for non-authorized roles.
- [ ] UI shows an empty state when no stores exist.

### FE-STORE-002 Create Store

Acceptance Criteria:

- [ ] UI provides a form for `StoreRequest` with required `name`.
- [ ] UI posts to `POST /api/v1/stores` and renders the new store in the list.
- [ ] UI handles `409` conflict and shows an actionable error message.

### FE-STORE-003 Store Details View

Acceptance Criteria:

- [ ] UI fetches store details via `GET /api/v1/stores/{id}`.
- [ ] For non-admins without membership, `404` maps to “store not found or no access”.
- [ ] Store details include name and timestamps if displayed.

### FE-STORE-004 Update Store

Acceptance Criteria:

- [ ] UI allows `admin`/`super_admin` to edit store name via `PATCH /api/v1/stores/{id}`.
- [ ] UI handles validation errors (`400`) by highlighting the invalid field.
- [ ] UI reflects changes without page reload.

### FE-STORE-005 Delete Store

Acceptance Criteria:

- [ ] UI allows `admin`/`super_admin` to delete a store via `DELETE /api/v1/stores/{id}`.
- [ ] UI confirms destructive action.
- [ ] UI removes the store from list after successful deletion.

### FE-STOREMEM-001 Add Store Member

Acceptance Criteria:

- [ ] UI allows `admin`/`super_admin` to add a user to a store via `POST /api/v1/stores/{id}/members`.
- [ ] UI validates `user_id` is present before submit.
- [ ] UI handles `409` conflict (already a member) with a clear message.

### FE-STOREMEM-002 Remove Store Member

Acceptance Criteria:

- [ ] UI allows `admin`/`super_admin` to remove a store member via `DELETE /api/v1/stores/{id}/members/{user_id}`.
- [ ] UI handles `404` with a soft refresh and message.
- [ ] UI updates membership list immediately after removal.

### FE-ORG-002 Transfer Org Ownership

Acceptance Criteria:

- [ ] UI allows only `super_admin` to initiate transfer via `POST /api/v1/org/transfer-ownership`.
- [ ] UI requires a target user selection and submits `target_user_id`.
- [ ] UI reflects new ownership state in members list without a full reload.
- [ ] UI handles `409` conflict (invalid state) with a clear message.

### FE-OPS-001 Health/Readiness Diagnostics (Optional Admin Tool) - SKIP

Acceptance Criteria:

- [ ] Optional admin-only diagnostic view calls `GET /health` and `GET /ready`.
- [ ] UI displays status and shows a warning when readiness is `503`.
