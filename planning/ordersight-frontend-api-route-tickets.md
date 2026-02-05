# ORDERSIGHT FRONTEND

## Backend Route Wiring Tickets

Document Version: 1.0  
Generated: 2026-01-30

---

## Scope

Frontend stories that correspond to backend stories which introduce new API routes in the Ordersight Backend MVP backlog (v1.1). These stories focus on correct wiring, state handling, and error outcomes over visual styling.

---

## Common Response Outcomes

All API calls return error payloads in `{ code, message, meta? }` format (per backend STORY-051). Each story references the outcome IDs below to keep handling consistent and centralized.

| Outcome ID | HTTP Status                       | When It Happens                  | Frontend Handling Expectation                                                                |
| ---------- | --------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| O1         | 200/201                           | Success                          | Update UI state and cached data; reflect authoritative server response.                      |
| O2         | 400                               | Validation/Bad Request           | Show field-level and/or form-level errors from `message` and `meta`; keep user input intact. |
| O3         | 401                               | Unauthenticated                  | Trigger re-auth (Clerk) and return to the intended page after sign-in.                       |
| O4         | 403                               | Forbidden or business-rule block | Show permission or rule-based messaging; do not retry.                                       |
| O4b        | 403 + code `org_not_bootstrapped` | Org not bootstrapped             | Trigger bootstrap flow and retry original request once bootstrap completes.                  |
| O5         | 402                               | Billing suspended                | Present billing-gated state; if `meta.billing_portal` exists, show CTA.                      |
| O6         | 404                               | Not found / cross-tenant         | Show not-found or empty-state; do not leak cross-tenant data.                                |
| O7         | 409                               | Conflict                         | Display conflict message and next-step action (e.g., rename, refresh).                       |
| O8         | 5xx/Network                       | Server or network failure        | Show a generic retryable error and keep UI responsive.                                       |

Design principle reminder: API calls live in domain-specific service modules, components remain presentational, and all views include explicit loading/empty/error states.

---

## Stories

### FE-API-001: Wire Org Bootstrap Request - SKIPPED (should be mostly done)

**Backend Story:** STORY-020A (and STORY-020B enrichment later)  
**Endpoints:** POST `/api/v1/bootstrap`

**Description:** Wire the onboarding bootstrap request from the frontend (e.g., `OnboardingBootstrapPage`) to create the internal org record. Treat Clerk as the identity oracle and keep the flow idempotent.

**Acceptance Criteria:**

- [x] API call implemented in a dedicated org service module using `postJSON`.
- [x] Request does not trust client-provided Clerk IDs; only uses them for optional debug display.
- [x] UI handles outcomes O1, O2, O3, O4 (claims mismatch or one-org-per-user), O4b, O8.
- [x] On O1, UI proceeds to the post-bootstrap destination with org context populated.
- [] On O4b, UI retries bootstrap once after Clerk org is ready, then surfaces a clear error state.

---

### FE-API-002: Member List View Wiring

**Backend Story:** STORY-027  
**Endpoints:** GET `/api/v1/members`
**Route handler filepath:** /Users/michaeljay/go-dev/ordersight/internal/handler/membership.go

**Description:** Load and render the org member list (roles, status, and user details) with pagination support if present.

**Acceptance Criteria:**

- [x] API call implemented in a membership service module using `getJSON`.
- [x] UI renders loading, empty, and error states distinctly.
- [x] UI handles outcomes O1, O3, O4, O4b, O6, O8.
- [x] Any missing PII fields are displayed gracefully (e.g., fallback labels).

---

### FE-API-003pre: Invite Members (Single or Batch)

**Backend Story:** STORY-030A  
**Endpoints:** POST `/api/v1/members/invite`

**Description:** Wire member invitations with role validation, seat-limit handling, and batch response support.

**Acceptance Criteria:**

- [ ] API call implemented in membership service module using `postJSON`.
- [ ] Request accepts a single invite object or an array of invite objects.
- [ ] UI handles outcomes O1, O2, O3, O4 (role hierarchy/super_admin restrictions), O4b, O7 (invite conflict or seat limit), O8.
- [ ] If an existing pending invite is near expiration, UI should surface a warning and offer a retry once expired.
- [ ] On O1, UI updates pending invite list and shows a success message.

---

### FE-API-003: Update Member Role

**Backend Story:** STORY-028  
**Endpoints:** PATCH `/api/v1/members/:id/role`

**Description:** Wire role updates with proper role hierarchy enforcement and optimistic UI where safe.

**Acceptance Criteria:**

- [ ] API call implemented in membership service module using `patchJSON`.
- [ ] UI disables role changes for self and super_admin where applicable.
- [ ] UI handles outcomes O1, O2, O3, O4 (role hierarchy/super_admin restrictions), O4b, O6, O8.
- [ ] On O1, UI reflects updated role from the server response (no stale optimistic state).

---

### FE-API-004: Remove Member

**Backend Story:** STORY-029  
**Endpoints:** DELETE `/api/v1/members/:id`

**Description:** Wire member removal with confirmation and non-destructive local state updates.

**Acceptance Criteria:**

- [ ] API call implemented in membership service module using `delJSON`.
- [ ] UI requires explicit confirmation before deletion.
- [ ] UI handles outcomes O1, O3, O4 (cannot remove super_admin), O4b, O6, O8.
- [ ] On O1, UI removes the member from the list and shows a success toast/message.

---

### FE-API-005: Transfer Super Admin Ownership

**Backend Story:** STORY-030  
**Endpoints:** POST `/api/v1/org/transfer-ownership`

**Description:** Wire ownership transfer flow so a current super_admin can transfer to another active member.

**Acceptance Criteria:**

- [ ] API call implemented in org service module using `postJSON`.
- [ ] UI restricts access to super_admin only and validates target selection.
- [ ] UI handles outcomes O1, O2, O3, O4 (not super_admin, invalid target), O4b, O6, O8.
- [ ] On O1, UI updates role labels and provides a clear confirmation message.

---

### FE-API-006: Billing State Summary

**Backend Story:** STORY-036  
**Endpoints:** GET `/api/v1/billing`

**Description:** Fetch and display billing status, plan info, seat usage, and period end with read-only support.

**Acceptance Criteria:**

- [ ] API call implemented in billing service module using `getJSON`.
- [ ] UI handles outcomes O1, O3, O4, O4b, O5, O8.
- [ ] On O5, UI indicates gated access and shows CTA to billing portal when available.
- [ ] Billing state is normalized into a shared, typed model for reuse by other views.

---

### FE-API-007: Billing Portal Link

**Backend Story:** STORY-037  
**Endpoints:** GET `/api/v1/billing/portal`

**Description:** Generate a billing portal URL and redirect the user to manage billing.

**Acceptance Criteria:**

- [ ] API call implemented in billing service module using `getJSON`.
- [ ] UI accessible only to admin+ roles.
- [ ] UI handles outcomes O1, O3, O4, O4b, O5, O6/O7 (missing Polar customer), O8.
- [ ] On O1, browser navigates to the returned URL; on failure, show recovery instructions.

---

### FE-API-008: Store CRUD Wiring

**Backend Story:** STORY-041  
**Endpoints:**

- GET `/api/v1/stores`
- POST `/api/v1/stores`
- GET `/api/v1/stores/:id`
- PATCH `/api/v1/stores/:id`
- DELETE `/api/v1/stores/:id`

**Description:** Wire store list, create, detail, update, and delete flows with org scoping and role gating.

**Acceptance Criteria:**

- [ ] API calls implemented in a store service module using `getJSON`, `postJSON`, `patchJSON`, `delJSON`.
- [ ] Admin-only actions (create/update/delete) are hidden or disabled for non-admins.
- [ ] UI handles outcomes O1, O2, O3, O4, O4b, O6, O7 (name conflict), O8.
- [ ] List and detail views keep state in sync after create/update/delete without full page reloads.

---

### FE-API-009: Order CRUD Wiring

**Backend Story:** STORY-043  
**Endpoints:**

- GET `/api/v1/orders`
- POST `/api/v1/orders`
- GET `/api/v1/orders/:id`
- PATCH `/api/v1/orders/:id`

**Description:** Wire order list, create, detail, and update flows with billing read/write gates.

**Acceptance Criteria:**

- [ ] API calls implemented in an order service module using `getJSON`, `postJSON`, `patchJSON`.
- [ ] UI respects billing access rules (read-only in grace period; no writes when suspended).
- [ ] UI handles outcomes O1, O2, O3, O4, O4b, O5, O6, O8.
- [ ] On O5, write actions are blocked with a clear billing CTA; read actions remain available.

---

### FE-API-010: Contact CRUD Wiring

**Backend Story:** STORY-045  
**Endpoints:**

- GET `/api/v1/contacts`
- POST `/api/v1/contacts`
- GET `/api/v1/contacts/:id`
- PATCH `/api/v1/contacts/:id`
- DELETE `/api/v1/contacts/:id`

**Description:** Wire contact list, create, detail, update, and delete flows for non-authenticated contacts.

**Acceptance Criteria:**

- [ ] API calls implemented in a contact service module using `getJSON`, `postJSON`, `patchJSON`, `delJSON`.
- [ ] UI handles outcomes O1, O2, O3, O4, O4b, O6, O8.
- [ ] Contact forms retain user input on validation errors and highlight missing/invalid fields.
- [ ] List/detail views remain consistent after mutations without full page reloads.

---

## Notes

- This document intentionally avoids styling requirements; focus is on wiring, data flow, and outcome handling.
- When backend STORY-051 is complete, ensure centralized error handling uses `code` for routing decisions.
- Webhook endpoints (STORY-049/050) are excluded because they are server-to-server only.
