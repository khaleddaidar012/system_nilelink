# Task: Notification Rejection Bug Fix

Status: pending
Priority: high

---

## Objective

Fix a critical bug where uploading multiple documents (e.g., 3 files at once) creates spurious "document rejected" notifications for the customer — one phantom rejection per uploaded file. This causes significant confusion as customers believe their documents were rejected immediately after upload.

---

## Background & Root Cause Analysis

### Upload Flow
File: `app/api/portal/documents/upload/route.ts`

1. The upload handler loops over each uploaded file
2. For each file, it creates a `Document` record with `status: "pending_review"`
3. After the loop, it creates ONE staff notification: "New Documents Awaiting Review"

### Notification Bug Hypothesis
The phantom "rejected" notifications are likely caused by one of the following:

**Hypothesis A — Existing orphaned notifications from previous uploads:**
When a customer uploads documents, the system may be fetching ALL notifications with type `"document_rejected"` that are linked to the customer, regardless of whether they were created for a *different* upload event. Old rejection notifications from past document reviews appear on every new upload.

**Hypothesis B — Notification query too broad in `/api/portal/notifications/route.ts`:**
The query includes `{ targetAudience: "customer", recipientUserId: null, recipientCustomerId: null }` — this catch-all may surface staff-targeted notifications accidentally.

**Hypothesis C — Notification count in bell popover miscounts:**
The `unreadCount` may be computed from ALL unread notifications of any type (including old rejections from prior uploads that were never marked read), making it appear as new rejections on each upload.

**Hypothesis D — Upload route creates per-file rejection notification by mistake:**
Inspect whether some code path during upload errors and creates a `"document_rejected"` notification for each file.

### Confirmed Issue
Per user report: uploading 3 documents → 3 "rejected" notifications appear immediately. This matches a per-file iteration creating notifications.

---

## Subtasks

- [ ] **2.1** Carefully read the full `app/api/portal/documents/upload/route.ts` file and trace every `Notification.create(...)` call made during upload
- [ ] **2.2** Confirm: Does the upload route create any `"document_rejected"` type notification? If yes, remove or correct it
- [ ] **2.3** Read `app/api/portal/notifications/route.ts` and audit the notification query — specifically verify the `$or` catch-all clause does not pull in staff-targeted notifications
- [ ] **2.4** Read `components/portal/NotificationBellPopover.tsx` and audit how `unreadCount` is computed — verify it excludes `targetAudience: "staff"` notifications
- [ ] **2.5** Read `components/portal/PortalContext.tsx` and check how `unreadCount` is fetched and stored in context
- [ ] **2.6** Fix the root cause:
  - If upload route creates per-file rejection notifications → remove those lines
  - If notification query is too broad → add filter `targetAudience: { $in: ["customer"] }` and ensure `recipientCustomerId` matches the session customer
  - If bell popover counts staff notifications → add explicit `targetAudience` filter to the count query
- [ ] **2.7** Ensure the notification query for customers filters by either:
  - `recipientCustomerId === session.customerId AND targetAudience === "customer"`, OR
  - `recipientUserId === session.userId`
  - NOT staff or super_admin notifications
- [ ] **2.8** Optionally: write a one-time cleanup script in `scripts/` to delete orphaned phantom rejection notifications from the database (status: `"document_rejected"`, where the linked document actually has `status: "pending_review"`)
- [ ] **2.9** Test: Upload 1 document → verify 0 rejection notifications are created
- [ ] **2.10** Test: Upload 3 documents → verify 0 rejection notifications are created, only 1 "Documents Awaiting Review" staff notification is created
- [ ] **2.11** Test: Admin rejects a document → verify exactly 1 rejection notification is created for the customer
- [ ] **2.12** Test: Existing unread notifications from real rejections still appear correctly after the fix

---

## Acceptance Criteria

- [ ] Uploading 1 document creates 0 customer-visible rejection notifications
- [ ] Uploading 3 documents creates 0 customer-visible rejection notifications
- [ ] Uploading N documents creates exactly 1 staff notification ("New Documents Awaiting Review")
- [ ] When admin genuinely rejects a document via the verify API, exactly 1 rejection notification is delivered to the correct customer
- [ ] Notification bell popover shows correct unread count (does not include staff-targeted notifications)
- [ ] Old unread real rejection notifications still appear correctly in the customer's notification list

---

## Dependencies

- `app/api/portal/documents/upload/route.ts`
- `app/api/portal/notifications/route.ts`
- `components/portal/NotificationBellPopover.tsx`
- `components/portal/PortalContext.tsx`

---

## Edge Cases

- [ ] Customer with `targetAudience: "all_staff"` notifications somehow leaking into customer feed
- [ ] Notification with `recipientCustomerId: null` and `recipientUserId: null` being shown to all customers
- [ ] Multiple uploads in rapid succession creating duplicate staff notifications
- [ ] Old rejection notifications (from previous actual rejections) must not be deleted by the cleanup script

---

## Regression Requirements

Must NOT break:
- Real document rejection notifications (from admin verify route)
- Real document approval notifications
- Staff notification bell (staff see their own notifications correctly)
- Notification mark-as-read functionality
