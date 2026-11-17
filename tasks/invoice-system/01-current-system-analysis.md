# Task 01 — Current System Analysis & Baseline Audit

## 1. Task Name
Codebase Discovery, Inventory Audit & Gap Analysis for Invoicing

## 2. Goal
Thoroughly examine the existing Nile Link Logistics implementation across models, authentication guards, customer portal financials, admin interfaces, document storage, and notification channels. Identify every reusable component, existing gap, and critical security defect to ensure the new Invoice Management System builds upon existing patterns without regressions or redundant code.

---

## 3. Existing System Audit

### 3.1 Data Models (`lib/models/`)
| Model File | Current Role & Schema Structure | Relevance & Necessary Enhancements |
|---|---|---|
| [Invoice.ts](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts) | Defines `IInvoice` with `customerId`, `invoiceNumber`, `relatedQuoteId`, `relatedRequestId`, `subtotal`, `tax`, `discount`, `totalAmount`, `paidAmount`, `remainingAmount`, `currency`, `items`, `status`, `issueDate`, `dueDate`, `token`. | **Gaps**: Status enum only has `["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"]`. Missing **`confirmed`**. Lacks immutable snapshots (`customerSnapshot`, `shipmentSnapshot`, `issuerSnapshot`). Lacks tracking fields (`confirmedBy`, `confirmedAt`, `sentBy`, `sentAt`, `recipientEmail`, `internalNotes`, `additionalCharges`, `taxRate`). |
| [Customer.ts](file:///d:/khaled/nile_link_website-main/lib/models/Customer.ts) | Holds company profiles: `companyName`, `commercialRegisterNumber`, `taxCardNumber`, `country`, `city`, `address`, `contactPhone`, `contactEmail`, `accountStatus`. | Reused directly for customer selection, validation, and historical snapshot data generation. |
| [CustomerRequest.ts](file:///d:/khaled/nile_link_website-main/lib/models/CustomerRequest.ts) | Represents operational shipments & service requests: `trackingNumber`, `serviceType`, `services`, `complianceType` (ACID/UCR), `complianceNumber`, `status`. | Reused to link invoices directly to shipments and extract freight parameters. |
| [Payment.ts](file:///d:/khaled/nile_link_website-main/lib/models/Payment.ts) | Records financial payments: `invoiceId`, `customerId`, `amount`, `paymentMethod`, `paymentDate`, `referenceNumber`. | Fully compatible; will link to confirmed invoices to track paid and remaining balance. |
| [DocumentActivityLog.ts](file:///d:/khaled/nile_link_website-main/lib/models/DocumentActivityLog.ts) | Audit logging model for document events with `actorId`, `actorType`, `action`, `previousState`, `newState`. | Serves as the exact architectural reference pattern for `InvoiceActivityLog.ts`. |
| [Notification.ts](file:///d:/khaled/nile_link_website-main/lib/models/Notification.ts) | Manages in-app, email, and WhatsApp notifications with `recipientUserId`, `recipientCustomerId`, `targetAudience`, `type`, `severity`. | `NotificationType` can be extended with invoice lifecycle events (`invoice_created`, `invoice_confirmed`, `invoice_sent`). |
| [SystemSetting.ts](file:///d:/khaled/nile_link_website-main/lib/models/SystemSetting.ts) | Stores global system configuration. | Can store Nile Link company billing metadata (tax number, registered address, bank account details) to avoid hardcoding company info. |

### 3.2 Authentication & Authorization (`lib/auth/`)
- **[token-service.ts](file:///d:/khaled/nile_link_website-main/lib/auth/token-service.ts)**: Implements Jose-based JWT access and refresh cookies (`nilelink_access_token`). Provides `getServerSession()` and `getSessionFromRequest(req)` returning `AuthSessionPayload` with `userId`, `email`, `role`, `customerId`, `staffPermissions`.
- **[rbac-guard.ts](file:///d:/khaled/nile_link_website-main/lib/auth/rbac-guard.ts)**: Provides `requireAuth(req, allowedRoles)` and helper functions `isStaffOrAdmin()` and `isCustomer()`.
- **[require-permission.ts](file:///d:/khaled/nile_link_website-main/lib/auth/require-permission.ts)**: Provides `assertStaffPermission(req, permissionKey)`. Super_admin bypasses checks. We must introduce operational permission keys: `canManageInvoices` and `canConfirmInvoices`.

### 3.3 Existing Financials & Portal Code
- **[app/api/portal/financials/route.ts](file:///d:/khaled/nile_link_website-main/app/api/portal/financials/route.ts)**:
  - Fetches invoices for authenticated customer: `Invoice.find({ customerId })`.
  - **CRITICAL SECURITY FLAW**: Line 35 queries all invoices for `customerId` without filtering by status. Although line 42 excludes drafts when computing summary metrics, **draft invoices are returned directly in the `invoices` array to customer clients**! This violates the core requirement that drafts must never be visible to customers.
- **[app/api/invoice/[token]/route.ts](file:///d:/khaled/nile_link_website-main/app/api/invoice/%5Btoken%5D/route.ts)**:
  - Public invoice retrieval endpoint using secure random UUID token.
  - **SECURITY GAP**: Does not verify invoice status. An unconfirmed draft with a known token would be publicly visible. Must enforce `status !== "draft"`.
- **[components/portal/financials/InvoiceLivePreview.tsx](file:///d:/khaled/nile_link_website-main/components/portal/financials/InvoiceLivePreview.tsx)**:
  - Well-styled visual invoice component with company header, line items table, and payment status progress bar.
  - Contains hardcoded sample company information ("123 Maritime Blvd, Alexandria, Egypt", "VAT: 994-123-456").
  - Action buttons (`Print`, `Download PDF`, `Copy Link`) have no click handlers attached.
- **[components/portal/PortalSidebar.tsx](file:///d:/khaled/nile_link_website-main/components/portal/PortalSidebar.tsx)**:
  - Already contains an active navigation item pointing to `/portal/financials` ("Financials & Invoices").
- **[components/admin/AdminSidebar.tsx](file:///d:/khaled/nile_link_website-main/components/admin/AdminSidebar.tsx)**:
  - Invoicing currently sits under `upcomingLogisticsModules` as `/admin/coming-soon/financials`. Needs to be promoted to `coreNavItems` as `/admin/invoices`.

### 3.4 Email Infrastructure (`lib/email/`)
- Providers available: `Resend` ([resend.ts](file:///d:/khaled/nile_link_website-main/lib/email/providers/resend.ts)) and `SMTP/Nodemailer` ([smtp.ts](file:///d:/khaled/nile_link_website-main/lib/email/providers/smtp.ts)).
- Currently `SendEmailOptions` in [types.ts](file:///d:/khaled/nile_link_website-main/lib/email/types.ts) only accepts `{ to, subject, html }`.
- **Enhancement needed**: Add `attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>` to support sending generated invoice PDF buffers.

### 3.5 Storage Infrastructure (`lib/storage/r2-storage.ts`)
- Configured with AWS S3 SDK for Cloudflare R2 with fallback to local filesystem `storage/r2_local_fallback`.
- Already supports `folder: "invoices"` in `generateStorageKey(customerId, "invoices", fileName)`.

---

## 4. Key Security Gaps & Identified Risks

1. **Customer Draft Leak in Portal**: Customer portal API `/api/portal/financials` currently returns all invoices regardless of status.
   *Resolution*: Update query to `{ customerId, status: { $ne: "draft" } }`.
2. **Public Token Draft Exposure**: `/api/invoice/[token]` currently renders invoices regardless of status.
   *Resolution*: Return 404 or 403 if `invoice.status === "draft"`.
3. **No Immutable Snapshots**: If a customer alters their company name or tax registration number after invoice issuance, historical invoices would reflect the updated info, violating Egyptian and international tax compliance rules.
   *Resolution*: Store immutable `customerSnapshot`, `shipmentSnapshot`, and `issuerSnapshot` inside the Invoice record upon confirmation.
4. **Race Condition in Number Generation**: Relying on count or client-side strings causes duplicate invoice numbers under concurrent creation.
   *Resolution*: Implement a dedicated `InvoiceSequence` collection with atomic `findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true })`.
5. **Client-Side Financial Calculations**: Never trust subtotal or totals sent from client forms.
   *Resolution*: Implement a centralized backend calculation engine that recalculates line item totals, tax, discounts, and final amounts server-side.

---

## 5. Architectural Decisions Summary

1. **Keep Mongoose & MongoDB**: Nile Link's entire backend utilizes Mongoose 9.7 with standard schemas. All invoice entities will follow this standard.
2. **Two-Tier State Gate**: A clear architectural distinction between `draft` (private internal workspace) and `confirmed` (public commercial record).
3. **Dedicated Invoice Audit Log**: Instead of cluttering the main document activity log, create `InvoiceActivityLog` mirroring the established pattern in `DocumentActivityLog`.
4. **Preserve Existing Portal Financials Route**: Enhance `app/[locale]/portal/financials/page.tsx` and `app/api/portal/financials/route.ts` rather than deprecating them.

---

## 6. Acceptance Criteria
- [ ] All existing files interacting with financial data are inventoried.
- [ ] Critical security gaps (draft leak in customer portal and public token route) are clearly documented.
- [ ] Missing models, permission keys, and email attachment capabilities are identified.
- [ ] Dependencies between existing infrastructure and the new invoicing system are mapped.

---

## 7. Dependencies
None (baseline analysis task).
