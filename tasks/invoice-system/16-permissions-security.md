# Task 16 — Permissions, Role-Based Access & Security Hardening

## 1. Task Name
Granular Financial RBAC, IDOR Immunization & Security Hardening

## 2. Goal
Establish fine-grained Role-Based Access Control (RBAC) across all invoice operations, update `IStaffPermissions` and `RoleConfig`, enforce strict IDOR boundaries, prevent financial parameter tampering, and sanitize inputs to eliminate XSS, injection, and unauthorized data leakage.

---

## 3. Existing System
- [lib/models/User.ts](file:///d:/khaled/nile_link_website-main/lib/models/User.ts): Holds `UserRole` (`customer | customer_admin | staff | super_admin`) and `IStaffPermissions`.
- [lib/models/RoleConfig.ts](file:///d:/khaled/nile_link_website-main/lib/models/RoleConfig.ts): Role configuration model.
- [lib/auth/require-permission.ts](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts): Staff permission assertion utility.
- [lib/auth/rbac-guard.ts](file:///d:/khaled/nile_link_website-main/lib/auth/rbac-guard.ts): Role verification utilities.

---

## 4. Requirements & Permission Matrix

### 4.1 Permission Definitions
Add financial permissions to `IStaffPermissions`:
1. `canManageInvoices`: Authorize creating and editing draft invoices, managing line items, and updating draft notes.
2. `canConfirmInvoices`: Authorize approving internal review and officially confirming invoices into legally binding commercial records.
3. `canCancelInvoices`: Authorize voiding or cancelling confirmed invoices.

### 4.2 Comprehensive Matrix
| Action | `super_admin` | Staff with `canManageInvoices` | Staff with `canConfirmInvoices` | Staff with `canCancelInvoices` | `customer_admin` / `customer` |
|---|---|---|---|---|---|
| View All Invoices (Admin) | ✅ | ✅ | ✅ | ✅ | ❌ 403 Forbidden |
| View Customer Portal Invoices | N/A | N/A | N/A | N/A | ✅ (Own Confirmed Only) |
| Create Draft Invoice | ✅ | ✅ | ❌ (unless granted) | ❌ (unless granted) | ❌ 403 Forbidden |
| Edit Draft Invoice | ✅ | ✅ | ❌ (unless granted) | ❌ (unless granted) | ❌ 403 Forbidden |
| Confirm Draft Invoice | ✅ | ❌ (unless granted) | ✅ | ❌ (unless granted) | ❌ 403 Forbidden |
| Send Invoice to Customer | ✅ | ✅ | ✅ | ❌ (unless granted) | ❌ 403 Forbidden |
| Cancel Confirmed Invoice | ✅ | ❌ | ❌ | ✅ | ❌ 403 Forbidden |
| Delete Draft Invoice | ✅ | ✅ | ❌ | ❌ | ❌ 403 Forbidden |
| Access Public Token Link | ✅ | ✅ | ✅ | ✅ | ✅ (If Non-Draft) |

---

## 5. Technical Implementation Details

### 5.1 Schema Updates
1. **In `lib/models/User.ts`**:
   ```typescript
   export interface IStaffPermissions {
     canSendAlerts: boolean
     canReviewDocuments: boolean
     canManageCustomers: boolean
     canManageInvoices?: boolean
     canConfirmInvoices?: boolean
     canCancelInvoices?: boolean
   }
   ```
2. **In `lib/models/RoleConfig.ts`**:
   Update `permissions` schema to include `canManageInvoices`, `canConfirmInvoices`, `canCancelInvoices` (default `false`).

### 5.2 Endpoint Guard Assertions
- In `POST /api/admin/invoices` and `PUT /api/admin/invoices/[id]`:
  ```typescript
  const auth = await assertStaffPermission(req, "canManageInvoices")
  if (!auth.authorized) return auth.response
  ```
- In `POST /api/admin/invoices/[id]/confirm`:
  ```typescript
  const auth = await assertStaffPermission(req, "canConfirmInvoices")
  if (!auth.authorized) return auth.response
  ```
- In `POST /api/admin/invoices/[id]/cancel`:
  ```typescript
  const auth = await assertStaffPermission(req, "canCancelInvoices")
  if (!auth.authorized) return auth.response
  ```

---

## 6. Security Defense-in-Depth Checklist

1. **IDOR Immunity**:
   - Every customer portal API query includes `{ customerId: session.customerId }` extracted from verified JWT cookies.
   - Customers never pass their own customer ID in the request URL or body.
2. **Draft Isolation**:
   - Every customer portal query explicitly enforces `{ status: { $ne: "draft" } }`.
   - Token retrieval route `/api/invoice/[token]` enforces `{ status: { $ne: "draft" } }`.
3. **Data Field Sanitization & Projection**:
   - `internalNotes` is filtered out of all customer responses.
   - Customer snapshot fields use strict string sanitization to prevent HTML/XSS injection into PDF generators.
4. **Calculations Tampering Guard**:
   - Subtotal, tax, and totals in incoming request bodies are ignored. The backend always recalculates financials using `calculateInvoiceTotals()`.
5. **Rate Limiting**:
   - Public token route `/api/invoice/[token]` utilizes `lib/auth/rate-limiter.ts` to prevent brute-force token enumeration.

---

## 7. Files To Modify
- `lib/models/User.ts`
- `lib/models/RoleConfig.ts`
- `app/api/admin/roles/route.ts` (if existing, add new permission toggles)
- `app/[locale]/admin/staff/page.tsx` (expose permission toggles in staff management UI)

---

## 8. Acceptance Criteria
- [ ] `canManageInvoices`, `canConfirmInvoices`, and `canCancelInvoices` added to staff permissions schema.
- [ ] Staff without `canConfirmInvoices` cannot confirm draft invoices.
- [ ] Customers attempting to fetch or access drafts receive 404 or 403.
- [ ] Customers attempting to access another client's invoice receive 404 (IDOR safe).
- [ ] Internal notes never leak to customer portals or customer PDFs.

---

## 9. Testing Instructions
1. Create a staff user with `canManageInvoices: true` and `canConfirmInvoices: false`.
2. As this user, create a draft invoice (succeeds).
3. Attempt to confirm the draft invoice; verify rejection with HTTP 403: *"Access denied. You lack the 'canConfirmInvoices' operational permission."*
4. Grant `canConfirmInvoices: true` and retry; verify confirmation succeeds.
5. Attempt IDOR access with a customer token; verify complete blocking.

---

## 10. Dependencies
- Depends on: `02-database-models.md`, `04-invoice-backend-api.md`, `11-draft-confirm-workflow.md`
- Pre-requisite for: `17-search-filtering.md`, `19-testing.md`
