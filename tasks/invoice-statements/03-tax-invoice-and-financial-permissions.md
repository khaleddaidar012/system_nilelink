# Task 03: Tax Invoice & Financial Permissions Architecture

## Objective
Implement robust, server-validated role-based access control (RBAC) for tax invoice issuance and customer financial statements. Specifically, introduce and enforce the `issueTaxInvoice` permission along with related financial privileges (`createInvoice`, `editInvoice`, `viewCustomerStatements`, `exportCustomerStatements`, `sendFinancialDocuments`). Ensure that unauthorized employees cannot view the Tax Invoice option in the UI AND cannot generate or export Tax Invoices via direct API calls.

## Existing System Analysis
1. **User Schema & Staff Permissions**:
   - [`lib/models/User.ts`](file:///d:/khaled/nile_link_website-main/lib/models/User.ts) defines:
     ```typescript
     export interface IStaffPermissions {
       canSendAlerts: boolean
       canReviewDocuments: boolean
       canManageCustomers: boolean
     }
     ```
2. **Role Templates**:
   - [`lib/models/RoleConfig.ts`](file:///d:/khaled/nile_link_website-main/lib/models/RoleConfig.ts) defines template permissions matching `IStaffPermissions`.
3. **Session & JWT Serialization**:
   - [`lib/auth/token-service.ts`](file:///d:/khaled/nile_link_website-main/lib/auth/token-service.ts) stores `staffPermissions` in `UserTokenData` and encodes it in JWT access/refresh tokens.
4. **Backend Guard**:
   - [`lib/auth/require-permission.ts`](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts) exposes:
     ```typescript
     export async function assertStaffPermission(
       request: Request,
       permissionKey?: StaffPermissionKey
     ): Promise<{ authorized: true; session: AuthSessionPayload } | { authorized: false; response: NextResponse }>
     ```
     `super_admin` role automatically bypasses individual permission keys, while `staff` is strictly evaluated against `session.staffPermissions?.[permissionKey]`.
5. **Admin Staff & Roles Management**:
   - [`app/api/admin/staff/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/staff/route.ts)
   - [`app/api/admin/staff/[id]/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/staff/%5Bid%5D/route.ts)
   - [`app/api/admin/roles/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/roles/route.ts)
   - [`components/admin/staff/CreateStaffModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/staff/CreateStaffModal.tsx)
   - [`components/admin/staff/EditPermissionsModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/staff/EditPermissionsModal.tsx)
   - [`components/admin/staff/StaffTable.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/staff/StaffTable.tsx)

## Requirements
1. **Extend `IStaffPermissions`**:
   Update `IStaffPermissions` in [`lib/models/User.ts`](file:///d:/khaled/nile_link_website-main/lib/models/User.ts) and [`lib/models/RoleConfig.ts`](file:///d:/khaled/nile_link_website-main/lib/models/RoleConfig.ts):
   ```typescript
   export interface IStaffPermissions {
     // Existing
     canSendAlerts: boolean
     canReviewDocuments: boolean
     canManageCustomers: boolean
     // Financial & Statement Permissions
     createInvoice?: boolean
     editInvoice?: boolean
     issueTaxInvoice: boolean // Defaults to false for regular staff
     viewCustomerStatements?: boolean
     exportCustomerStatements?: boolean
     sendFinancialDocuments?: boolean
   }
   ```
2. **Backend Guard Enforcement**:
   - In `POST /api/admin/invoices`:
     - If `documentType === "tax_invoice"`, call `assertStaffPermission(req, "issueTaxInvoice")`.
     - Reject unauthorized attempts immediately with `403 Forbidden` (`{ error: "Access denied. You lack the 'issueTaxInvoice' permission." }`).
   - In `PUT /api/admin/invoices/[id]`:
     - If `documentType === "tax_invoice"`, verify `issueTaxInvoice`.
   - In `GET /api/admin/invoices/[id]/pdf`:
     - If requested with `?type=tax_invoice` or if the invoice has `documentType === "tax_invoice"`, verify `issueTaxInvoice`.
   - Never rely exclusively on frontend UI gating.
3. **Role & Staff UI Upgrades**:
   - Update `CreateStaffModal.tsx` and `EditPermissionsModal.tsx` to include checkboxes for:
     - "إصدار فواتير ضريبية (Issue Tax Invoices)" -> `issueTaxInvoice`
     - "إدارة وإنشاء الفواتير (Manage & Create Invoices)" -> `createInvoice`
     - "كشوفات حساب العملاء (Customer Statements)" -> `viewCustomerStatements` & `exportCustomerStatements`
     - "إرسال المستندات المالية للعميل (Send Financial Documents)" -> `sendFinancialDocuments`
   - Update `StaffTable.tsx` to display the active financial badges.
4. **Session Refresh**:
   - Ensure `/api/auth/me` and JWT token issuance propagate new permissions so active sessions reflect granted permissions without manual logout when possible.

## Files Likely To Change
- [`lib/models/User.ts`](file:///d:/khaled/nile_link_website-main/lib/models/User.ts)
- [`lib/models/RoleConfig.ts`](file:///d:/khaled/nile_link_website-main/lib/models/RoleConfig.ts)
- [`lib/auth/require-permission.ts`](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts)
- [`app/api/admin/staff/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/staff/route.ts)
- [`app/api/admin/staff/[id]/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/staff/%5Bid%5D/route.ts)
- [`app/api/admin/roles/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/roles/route.ts)
- [`components/admin/staff/CreateStaffModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/staff/CreateStaffModal.tsx)
- [`components/admin/staff/EditPermissionsModal.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/staff/EditPermissionsModal.tsx)
- [`components/admin/staff/StaffTable.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/staff/StaffTable.tsx)
- [`app/api/admin/invoices/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/route.ts)
- [`app/api/admin/invoices/[id]/pdf/route.ts`](file:///d:/khaled/nile_link_website-main/app/api/admin/invoices/%5Bid%5D/pdf/route.ts)

## Backend Changes
- Schema defaults: `issueTaxInvoice: false` in `UserSchema` and `RoleConfigSchema`.
- Route validation:
  ```typescript
  if (data.documentType === "tax_invoice" || docType === "tax_invoice") {
    const auth = await assertStaffPermission(req, "issueTaxInvoice")
    if (!auth.authorized) return auth.response
  }
  ```
- Validation schema in staff API (`createStaffSchema`, `updateStaffSchema`) updated to include the new boolean keys.

## Frontend Changes
- In document type selector:
  - Check `userSession?.role === "super_admin" || userSession?.staffPermissions?.issueTaxInvoice`.
  - If false: Omit `"فاتورة ضريبية"` from the dropdown/radios.
- In Staff Management (`/admin/staff`):
  - Add section "الصلاحيات المالية والمستندات الضريبية (Financial & Tax Permissions)".

## Security / Permissions
- `super_admin` has unconditional access to all financial operations and tax invoice issuance.
- Regular `staff` must be explicitly assigned `issueTaxInvoice: true` by an admin.
- Any direct HTTP request (via curl, Postman, or devtools) attempting to set `documentType: "tax_invoice"` or fetch `?type=tax_invoice` without the permission receives HTTP 403 Forbidden.

## Edge Cases
- **Super Admin Bypass**: Ensure `assertStaffPermission` continues allowing `super_admin` full access without needing explicit manual flag toggling.
- **Existing Staff Users**: Users already registered in MongoDB will have `issueTaxInvoice: undefined`. The boolean coercion `session.staffPermissions?.issueTaxInvoice ?? false` must safely treat this as `false`.

## Acceptance Criteria
- [ ] `issueTaxInvoice` and statement permission keys added to `IStaffPermissions` and `RoleConfig`.
- [ ] Admin can toggle `issueTaxInvoice` on/off per staff member in `EditPermissionsModal`.
- [ ] Staff user WITHOUT `issueTaxInvoice` cannot see "فاتورة ضريبية" in the UI.
- [ ] Direct `POST /api/admin/invoices` with `documentType: "tax_invoice"` returns 403 for unauthorized staff.
- [ ] Direct `GET /api/admin/invoices/[id]/pdf?type=tax_invoice` returns 403 for unauthorized staff.
- [ ] Staff user WITH `issueTaxInvoice` can issue and download tax invoices without errors.

## Dependencies
- **Task 01**: Analyze Current Financial & Document Architecture.
- **Task 02**: Financial Document Type Architecture & Data Separation.

## Testing
1. Authenticate as staff member with `issueTaxInvoice: false`. Verify option is hidden.
2. Send curl request with staff JWT requesting `documentType: "tax_invoice"`. Confirm `403 Forbidden` response.
3. Authenticate as `super_admin`. Confirm option is visible and API accepts request.
4. Toggle `issueTaxInvoice: true` for staff member; verify option becomes visible and functional.
