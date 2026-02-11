# Stores UX Wireframe Hierarchy (Reference)

## Global navigation (top-level)

```
[ Today ]   [ Stores ]   [ Admin ]   [ Profile ]
```

**Key ideas**

- **Stores is primary**, not Admin.
- Admin is explicitly _meta_.
- Today is cross-store and time-based.
- Profile is personal, not organizational.

---

## Stores index page (`/stores`)

This page answers: **“Which operational context do I want to enter?”**

### Wireframe

```
------------------------------------------------
Stores                                    [+ Create Store] (admin only)
------------------------------------------------

[ Filter: All | Active | Archived ]   (admin only)

------------------------------------------------
| Store Card / Row                          |
|-------------------------------------------|
| Store Name                                |
| Location / Descriptor                     |
| Status Badge (Active / Paused / Archived) |
|                                           |
| • Orders today: 5                         |
| • Pending actions: 2                      |
------------------------------------------------

(repeat)
```

### Behavior rules

- **Members** see only stores they belong to.
- **Admins** see all stores.
- Clicking a store → enters that store.
- No settings here beyond _existence-level_ actions.
- If user belongs to **exactly one store**, auto-enter

---

## Store shell (`/stores/:storeId/*`)

Once inside a store, the UI collapses the universe to that store.

### Store shell layout

```
------------------------------------------------
← Stores     Store Name        Role: Admin | Staff
------------------------------------------------

[ Orders ] [ Team ] [ Activity ] [ Settings* ]

------------------------------------------------
(tab content)
```

**Invariants**

- Store name is always visible.
- Role is always visible.
- No ambiguity about _where_ you are.

---

## Store → Orders (default tab)

The operational heart.

```
------------------------------------------------
Orders
------------------------------------------------

[ Today | Upcoming | All ]

------------------------------------------------
| Order Row                                  |
|--------------------------------------------|
| Customer Name        Date / Time            |
| Order Status         Assigned To            |
| Payment Status       Total                  |
------------------------------------------------
```

**Rules**

- Default landing tab.
- Optimized for scanning, not configuration.
- Clicking an order drills deeper, not sideways.

---

## Store → Team

Answers: **“Who operates this store?”**

```
------------------------------------------------
Team
------------------------------------------------

[ + Add Member ] (admin only - member doesn't have option to accept/decline and may not leave store)

------------------------------------------------
| Name        | Role      | Status | Actions  |
------------------------------------------------
| Jane Smith  | Staff     | Active | …        |
| Bob Jones   | Admin     | Active | …        |
------------------------------------------------
```

**Conceptual cues**

- Roles are **store-scoped**.
- Membership is explicit.
- You can be “in the org” but not “in this store”.

Admin-only actions

- Add to store
- Change role
- Remove from store

---

## Store → Activity (or Notifications)

Answers: **“What has happened here?”**

```
------------------------------------------------
Activity
------------------------------------------------

• Order #482 marked Delivered (Jane)
• Invoice sent to Customer X
• Bob added Alice to the store
```

Notes

- Human-readable
- Chronological
- Not named “Audit Logs” in the UI (but satisfies that need)

---

## Store → Settings (admin only)

Answers: **“How does this store behave?”**

```
------------------------------------------------
Settings
------------------------------------------------

Store Details
- Name
- Location
- Hours
- Notes

Operational Settings
- Order workflow defaults
- Notifications

Danger Zone
- Archive store
```

Rules

- No billing here.
- No org-level users here.
- Everything is clearly “about this store”.

---

## Admin (`/admin`)

Intentionally boring.

```
------------------------------------------------
Admin
------------------------------------------------

[ Users ] [ Billing ] [ Org Settings ]
```

Purpose

- Governance
- Ownership
- Money
- Compliance

Not

- Day-to-day work
- Orders
- Stores themselves

---

## Today (cross-store, optional but important)

Answers: **“What needs attention right now?”**

```
------------------------------------------------
Today
------------------------------------------------

Store A
• 2 orders due today
• 1 unpaid invoice

Store B
• 1 order awaiting confirmation
```

Rule

- Read-only aggregation.
- Clicking always takes you _into a store_.

---

## The invariant, made enforceable

> **Organizations govern.  
> Stores operate.  
> Orders live inside stores.  
> Admin never replaces entering a store.**
