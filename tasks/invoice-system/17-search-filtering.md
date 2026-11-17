# Task 17 — Advanced Search, Multi-Criteria Filtering & Performance Indexes

## 1. Task Name
Multi-Attribute Search, Filter Matrix & Database Index Optimization

## 2. Goal
Implement high-performance multi-attribute search and filtering across the admin invoice console and customer portal. Support real-time text matching across invoice numbers, customer legal names, and shipment tracking numbers, coupled with date range and status filters, backed by optimized MongoDB compound indexes and ReDoS-safe query sanitization.

---

## 3. Existing System
- [components/admin/invoices/AdminInvoicesToolbar.tsx](file:///d:/khaled/nile_link_website-main/tasks/invoice-system/06-admin-invoice-list.md): Toolbar component for admin filters.
- [components/portal/financials/FinancialsToolbar.tsx](file:///d:/khaled/nile_link_website-main/components/portal/financials/FinancialsToolbar.tsx): Existing portal toolbar component.
- [lib/models/Invoice.ts](file:///d:/khaled/nile_link_website-main/lib/models/Invoice.ts): Data model and indexes.

---

## 4. Requirements & Query Capabilities

### 4.1 Filter Capabilities Matrix
| Dimension | Admin Invoices Console | Customer Portal Financials |
|---|---|---|
| **Text Search** | Matches `invoiceNumber`, `customerSnapshot.companyName`, `customer.companyName`, `shipmentSnapshot.trackingNumber` | Matches `invoiceNumber`, `shipmentSnapshot.trackingNumber` |
| **Status Filter** | `all`, `draft`, `confirmed`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled` | `all`, `unpaid` (`confirmed` + `sent` + `partially_paid`), `paid`, `overdue` |
| **Date Range** | Issue Date Range (`startDate`, `endDate`) & Due Date Range | Issue Date Range |
| **Currency** | Filter by `EGP`, `USD`, `EUR` | Inherited from invoice |
| **Shipment Filter** | Filter by specific shipment `requestId` | Filter by shipment |
| **Customer Filter** | Filter by specific customer `customerId` | Locked to authenticated session |

### 4.2 ReDoS-Safe Regex Sanitization
All user-entered text queries must be sanitized before passing into MongoDB regular expressions:
```typescript
export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
}
```

---

## 5. Technical Implementation Details

### 5.1 MongoDB Query Builder: `lib/services/invoice-query-builder.ts`
```typescript
import { FilterQuery } from "mongoose"
import { IInvoice } from "@/lib/models/Invoice"
import { escapeRegex } from "@/lib/utils"

export interface InvoiceFilterParams {
  search?: string
  status?: string
  customerId?: string
  requestId?: string
  currency?: string
  startDate?: string
  endDate?: string
  isCustomerPortal?: boolean
}

export function buildInvoiceMongoQuery(params: InvoiceFilterParams): FilterQuery<IInvoice> {
  const query: FilterQuery<IInvoice> = {}

  // 1. Customer Portal Draft Guard
  if (params.isCustomerPortal) {
    query.status = { $ne: "draft" }
  }

  // 2. Customer ID Filter
  if (params.customerId) {
    query.customerId = params.customerId
  }

  // 3. Request / Shipment ID Filter
  if (params.requestId) {
    query.relatedRequestId = params.requestId
  }

  // 4. Currency
  if (params.currency && params.currency !== "all") {
    query.currency = params.currency
  }

  // 5. Status Filter
  if (params.status && params.status !== "all") {
    if (params.status === "unpaid") {
      query.status = { $in: ["confirmed", "sent", "partially_paid", "overdue"] }
    } else {
      query.status = params.status
    }
  }

  // 6. Date Range Filtering
  if (params.startDate || params.endDate) {
    query.issueDate = {}
    if (params.startDate) query.issueDate.$gte = new Date(params.startDate)
    if (params.endDate) {
      const end = new Date(params.endDate)
      end.setHours(23, 59, 59, 999)
      query.issueDate.$lte = end
    }
  }

  // 7. Full-text search across multiple fields
  if (params.search && params.search.trim().length > 0) {
    const cleanSearch = escapeRegex(params.search.trim())
    const searchRegex = new RegExp(cleanSearch, "i")

    query.$or = [
      { invoiceNumber: searchRegex },
      { "customerSnapshot.companyName": searchRegex },
      { "shipmentSnapshot.trackingNumber": searchRegex },
    ]
  }

  return query
}
```

### 5.2 Database Indexes Optimization
In `lib/models/Invoice.ts`, establish compound indexes to ensure fast queries on large document sets:
```typescript
InvoiceSchema.index({ customerId: 1, status: 1, createdAt: -1 })
InvoiceSchema.index({ status: 1, issueDate: -1 })
InvoiceSchema.index({ relatedRequestId: 1 })
InvoiceSchema.index({ invoiceNumber: 1 }, { unique: true })
```

---

## 6. Files To Create
- `lib/services/invoice-query-builder.ts`

## 7. Files To Modify
- `app/api/admin/invoices/route.ts`: Utilize `buildInvoiceMongoQuery`.
- `app/api/portal/financials/route.ts`: Utilize `buildInvoiceMongoQuery(isCustomerPortal=true)`.
- `lib/models/Invoice.ts`: Verify indexes.

---

## 8. Security Considerations
- Prevents ReDoS attacks via `escapeRegex`.
- Caps pagination limit at 100 to prevent denial of service through unbounded database queries.

---

## 9. Acceptance Criteria
- [ ] Typing an invoice number into the search bar filters results instantly.
- [ ] Filtering by customer name matches against snapshot and customer record.
- [ ] Status dropdown filters accurately between draft, confirmed, sent, paid, and overdue.
- [ ] Customer portal search is locked to non-draft invoices of the authenticated customer.
- [ ] Database queries execute with index scans rather than full collection scans.

---

## 10. Testing Instructions
1. In admin search bar, type `INV-` and verify matching invoices.
2. Select status "Drafts"; verify table shows only draft invoices.
3. Test ReDoS resilience by entering special regex symbols: `.*+?^${}()|[]\\` and confirm no server crash.

---

## 11. Dependencies
- Depends on: `04-invoice-backend-api.md`, `06-admin-invoice-list.md`, `12-customer-portal-invoices.md`
- Pre-requisite for: `18-ui-ux-polish.md`
