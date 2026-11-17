# Task 09: Customer Details Page Statement UI Integration

## Objective
Seamlessly integrate the Customer Account Statement system into the existing Customer Profile/Details page ([`app/[locale]/admin/customers/[id]/page.tsx`](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/%5Bid%5D/page.tsx)). Provide authorized employees with an intuitive, executive-grade interface to filter by date range and transaction category, inspect summary balance metrics, browse an interactive chronological ledger table, and initiate preview, print, export, and email workflows.

## Existing System Analysis
1. Customer Details Page Architecture:
   - [`app/[locale]/admin/customers/[id]/page.tsx`](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/%5Bid%5D/page.tsx):
     - Uses tab navigation at line 330:
       - `documents` ("سجل المستندات")
       - `invoices` ("الفواتير والماليات")
       - `governance` ("إدارة الحساب")
       - `profile` ("جهات الاتصال")
     - Manages customer state and compliance data.
2. Invoices Tab:
   - [`components/admin/customers/CustomerInvoicesTab.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/CustomerInvoicesTab.tsx):
     - Renders invoice metrics (Total Invoiced, Total Paid, Outstanding Due).
     - Renders invoice list with create/edit/review modals.
3. Design Language & Tokens:
   - Uses Tailwind CSS with custom palette: Slate, Emerald, Rose, Amber, and Nile Link primary blue (`#2563eb`).
   - Supports light and dark mode (`dark:bg-slate-900`, `dark:border-slate-800`).
   - Uses Lucide icons (`Calendar`, `Filter`, `Download`, `Printer`, `Send`, `RefreshCw`, `FileSpreadsheet`, `TrendingUp`, `TrendingDown`).

## Requirements
1. **Add "كشف الحساب (Customer Statement)" Tab**:
   - In [`app/[locale]/admin/customers/[id]/page.tsx`](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/%5Bid%5D/page.tsx):
     - Expand `selectedTab` union type: `"documents" | "profile" | "invoices" | "statements" | "governance"`.
     - Add tab button:
       ```tsx
       <button
         onClick={() => setSelectedTab("statements")}
         className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
           selectedTab === "statements"
             ? "bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400"
             : "text-secondary-500 hover:text-secondary-900 hover:bg-secondary-50 dark:hover:bg-secondary-800 dark:hover:text-white"
         }`}
       >
         {isEn ? "Account Statement" : "كشف الحساب المالي"}
       </button>
       ```
     - Gate tab visibility or action based on user permission (`viewCustomerStatements` or `super_admin`).

2. **Build `CustomerStatementTab` Component**:
   Create [`components/admin/customers/CustomerStatementTab.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/CustomerStatementTab.tsx):
   - **Control & Filter Toolbar**:
     - **Date Range Picker**:
       - `From Date` input.
       - `To Date` input.
       - Quick date preset buttons:
         - "هذا الشهر (This Month)"
         - "آخر 30 يوم (Last 30 Days)"
         - "السنة الحالية (Year to Date)"
         - "كامل السجل (All Time)"
     - **Transaction Type Filter Pills**:
       - `الكل (All Transactions)`
       - `شحنات (Shipments & Logistics)`
       - `فواتير (Invoices)`
       - `مدفوعات (Payments)`
     - **Action Buttons**:
       - `معاينة وطباعة (Print Preview)` -> triggers print window.
       - `تحميل PDF (Export PDF)` -> opens `/api/admin/customers/[id]/statement/pdf`.
       - `إرسال للعميل (Email Statement)` -> opens email dispatch modal.
       - `تحديث (Refresh)` -> re-fetches statement from API.

   - **Executive Financial KPI Ribbon (4 Cards)**:
     1. **الرصيد الافتتاحي (Opening Balance)**:
        - Displays initial liability before `fromDate`.
     2. **إجمالي المطالبات والرسوم (Total Debits / Charges)**:
        - Sum of billable invoices in period.
     3. **إجمالي المدفوعات والتحصيلات (Total Credits / Payments)**:
        - Sum of payments collected in period.
     4. **الرصيد الختامي المستحق (Closing Balance)**:
        - Final balance due with visual indicator:
          - Positive: Red/Amber banner (مستحق على العميل / Due from Client).
          - Zero: Emerald badge (حساب مسوى / Settled).
          - Negative: Blue badge (رصيد دائن لصالح العميل / Client Credit).

   - **Chronological Ledger Table**:
     - Responsive tabular presentation with sticky headers.
     - Columns:
       - **التاريخ (Date)**
       - **نوع المعاملة (Type)**: Icon badge (Invoice, Payment, Surcharge).
       - **البيان (Description)**
       - **المرجع (Reference)**: Clickable badge (links to Invoice drawer or Shipment details).
       - **مدين (Debit)**: Displayed in bold font with currency.
       - **دائن (Credit)**: Displayed in emerald font with currency.
       - **الرصيد التراكمي (Running Balance)**: Running net total formatted with thousands separators.
     - Empty state with informative graphic if no transactions exist in the selected period.

## Files Likely To Change
- New component: [`components/admin/customers/CustomerStatementTab.tsx`](file:///d:/khaled/nile_link_website-main/components/admin/customers/CustomerStatementTab.tsx)
- Customer Page: [`app/[locale]/admin/customers/[id]/page.tsx`](file:///d:/khaled/nile_link_website-main/app/%5Blocale%5D/admin/customers/%5Bid%5D/page.tsx)
- Types: [`types/customer-statement.ts`](file:///d:/khaled/nile_link_website-main/types/customer-statement.ts)

## Backend Changes
- `N/A` (Consumes `/api/admin/customers/[id]/statement` built in Task 06).

## Frontend Changes
- Add state management for statement filters (`fromDate`, `toDate`, `filterType`).
- Implement debounced or on-submit data fetching from the backend API.
- Support RTL and LTR localization strings in Arabic and English.

## Security / Permissions
- If the current employee lacks `viewCustomerStatements`, the tab either shows an access denied notice or is suppressed from the tab list.
- Action buttons (`Export PDF`, `Email`) are disabled or hidden if employee lacks `exportCustomerStatements` or `sendFinancialDocuments`.

## Edge Cases
- **No Internet or API Failure**: Display standard error toast and a "Retry" button.
- **Rapid Filter Changes**: Cancel in-flight abort controller requests to prevent race condition state updates.

## Acceptance Criteria
- [ ] "Customer Statement" tab renders cleanly within the Customer details page.
- [ ] Date picker and quick presets dynamically update the statement without page reload.
- [ ] Transaction type pills filter rows accurately.
- [ ] KPI cards accurately display Opening Balance, Total Debits, Total Credits, and Closing Balance.
- [ ] Ledger table correctly renders running balance across all transactions.
- [ ] UI perfectly matches Nile Link Logistics' design aesthetics in both light and dark modes.

## Dependencies
- **Task 04**: Customer Statement Data Model & Ledger Contracts.
- **Task 05**: Customer Ledger Calculation Engine.
- **Task 06**: Customer Statement Backend API & Payment Endpoints.

## Testing
- Navigate to customer detail page; click "كشف الحساب المالي" tab.
- Test date filtering with various ranges (e.g. Last 30 Days vs All Time); confirm Opening and Closing balances recalculate instantly.
- Test category filters (e.g. clicking "مدفوعات" shows only payment rows).
