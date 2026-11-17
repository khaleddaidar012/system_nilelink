# Task: Account Activation Status & Portal Lockout

Status: pending
Priority: high

---

## Objective

When a new customer registers, their account must display the correct status ("Under Review / جاري المراجعة") and all portal services must be completely inaccessible until an admin approves their uploaded documents. Currently, new accounts use the "warning" status which is ambiguous, and portal pages may still be accessible or show confusing states.

---

## Background & Current Behavior

### Registration Flow
- `POST /api/auth/register` creates a `Customer` record with `accountStatus: "warning"` and `statusReason: "Pending document upload and verification"`
- A `User` record is created linked to the customer
- The user is immediately logged in with a JWT session

### Portal Access Check
- `PortalSidebar` reads `customer.accountStatus`
- If `user.emailVerified === false` → sidebar locks all items and shows "Verification Required" link
- The `accountStatus: "warning"` state currently does NOT lock portal services

### What Needs to Happen
- After registration, the user should see a clear "Under Review" message in the sidebar and dashboard
- All portal service pages (documents, requests, quotes, financials, notifications) must be completely inaccessible (locked) until the customer's documents are approved and admin sets `accountStatus: "active"`
- Existing behavior for `emailVerified === false` lock must be preserved

---

## Subtasks

- [ ] **1.1** Audit the current `accountStatus` state machine in `Customer.ts` — determine if a new `"under_review"` value should be added or if `"warning"` with the existing `statusReason` is sufficient to represent "under review"
- [ ] **1.2** Decide and implement the correct initial status. Options:
  - Option A: Add `"under_review"` to the Customer `accountStatus` enum in `lib/models/Customer.ts`
  - Option B: Keep `"warning"` but enforce portal lockout based on `statusReason` containing "Pending"
  - **Recommendation**: Option A — cleaner semantic state, less fragile
- [ ] **1.3** Update `POST /api/auth/register` in `app/api/auth/register/route.ts` to set the initial `accountStatus` to `"under_review"` (or whichever value is chosen in 1.2)
- [ ] **1.4** Update the `ICustomer` interface and `CustomerSchema` enum in `lib/models/Customer.ts` to include the new status if Option A is chosen
- [ ] **1.5** Update `PortalSidebar` in `components/portal/PortalSidebar.tsx` to recognize `accountStatus === "under_review"` and lock all nav items with appropriate messaging
- [ ] **1.6** Update `AccountHealthAlertBanner` in `components/portal/AccountHealthAlertBanner.tsx` to show an "Under Review" banner when `accountStatus === "under_review"`
- [ ] **1.7** Update the portal dashboard page `app/[locale]/portal/page.tsx` to show a prominent "Account Under Review" state when `accountStatus === "under_review"`
- [ ] **1.8** Update the admin panel to handle the new `"under_review"` status — when staff approves all required documents and the account health engine recalculates, the status should transition to `"active"`
- [ ] **1.9** Update `lib/engine/account-health-engine.ts` to:
  - Recognize `"under_review"` as a valid input state
  - Transition `"under_review"` → `"active"` when all required documents are approved
  - Do NOT downgrade an `"active"` account to `"under_review"`
- [ ] **1.10** Ensure the seed data in `app/api/auth/login/route.ts` (`autoSeedIfEmpty`) still works correctly — seeded demo customer should be `"active"` not `"under_review"`
- [ ] **1.11** Add Arabic + English i18n keys for the new "Under Review" status badge and banner messages
- [ ] **1.12** Test: Register a new account → verify portal nav is fully locked → admin approves documents → verify portal unlocks

---

## Acceptance Criteria

- [ ] Newly registered account shows status "جاري المراجعة" (Under Review) in the sidebar badge
- [ ] All portal service tabs (Documents, Requests, Quotes, Financials, Notifications) are inaccessible (shown as locked/disabled) for `"under_review"` accounts
- [ ] A clear banner or message explains the user must wait for document verification
- [ ] After admin approves documents and health engine recalculates, account status transitions to `"active"` and portal unlocks
- [ ] Existing `emailVerified === false` lock still works correctly
- [ ] Existing `"active"`, `"warning"`, and `"inactive"` account states still behave as before
- [ ] Arabic RTL text is correct for all new UI states
- [ ] Seeded demo accounts are unaffected

---

## Dependencies

- `lib/models/Customer.ts` — enum update
- `lib/engine/account-health-engine.ts` — state machine update
- `app/api/auth/register/route.ts` — initial status
- `components/portal/PortalSidebar.tsx` — lockout UI
- `components/portal/AccountHealthAlertBanner.tsx` — banner UI
- `messages/ar.json`, `messages/en.json` — i18n keys

---

## Edge Cases

- [ ] User registers, does NOT upload any documents — remains "under_review" indefinitely with clear guidance
- [ ] User uploads documents but admin rejects them — stays "under_review" (or returns to "under_review" if it was "warning")
- [ ] Super admin manually overrides status from admin panel — must still work
- [ ] If session JWT still holds old `accountStatus`, PortalContext must re-fetch fresh customer data

---

## Regression Requirements

Must NOT break:
- Existing customer login
- Existing document upload for active customers
- Existing account health recalculation engine
- Existing admin customer list and status management
