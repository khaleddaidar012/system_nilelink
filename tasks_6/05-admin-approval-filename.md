# Task: Admin Approval — Staff Internal Filename

Status: completed
Priority: medium

---

## Objective

When an admin (staff) approves a customer document, they should be able to enter an internal file name (their own reference name for the file). This internal name is then displayed to the customer on the portal instead of the original upload filename. This allows staff to use standardized naming conventions while customers see a clean, meaningful document name.

---

## Background & Current State

### Document Approval Flow
File: `app/api/admin/documents/[id]/verify/route.ts`

The `verifySchema` already accepts a `title` field:
```ts
const verifySchema = z.object({
  status: z.enum(["approved", "rejected", "pending_review"]),
  title: z.string().optional(),   // ← already exists
  category: z.string().optional(),
  startDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  reviewNotes: z.string().nullable().optional(),
})
```

And it applies the title:
```ts
if (title && title.trim()) document.title = title.trim()
```

**So the backend ALREADY supports setting a title on approval.** The issue is likely that:
1. The admin approval UI does not have a visible "Internal File Name" input field
2. The customer portal document list may not display the `title` prominently

### What Needs to Be Done
1. Add a clearly labeled "Internal File Name" input to the admin document review/approval modal
2. Make this field prominent and mandatory on approval (not optional)
3. Ensure the customer portal document list shows the `title` field prominently as the document's display name

---

## Subtasks

### Backend Verification

- [x] **5.1** Confirm that `app/api/admin/documents/[id]/verify/route.ts` correctly saves the `title` field — verify the code path where `if (title && title.trim()) document.title = title.trim()` is applied on approval
- [x] **5.2** Consider making `title` required on approval status (not just optional):
  - Update `verifySchema` to require `title` when `status === "approved"`
  - Add a Zod `.refine()` check: if `status === "approved"`, `title` must be non-empty

### Admin UI Update

- [x] **5.3** Locate the admin document review UI component:
  - Check `components/admin/` for a document review modal or panel
  - Check `app/[locale]/admin/documents/` page
- [x] **5.4** In the admin document review/approval modal:
  - Add a text input field labeled "Internal File Name" (Arabic: "اسم الملف الداخلي")
  - Place it prominently above the approve button
  - Pre-fill with the existing document title (so staff can edit it)
  - Make it visually distinct (e.g., highlighted border, helper text)
  - Helper text: "This name will be displayed to the customer" / "سيظهر هذا الاسم للعميل"
- [x] **5.5** Ensure the `title` value from the input field is sent in the approval API request payload
- [x] **5.6** Add client-side validation: if approving and the title input is empty, show an inline error and prevent submission

### Customer Portal Update

- [x] **5.7** Review the customer portal document list component: `components/portal/documents/DocumentTable.tsx`
- [x] **5.8** Ensure the `title` field is displayed as the primary document name in the document list
- [x] **5.9** If the document is approved and has a title set by staff, show it prominently (not the raw uploaded filename)
- [x] **5.10** On the document detail/download view, show the staff-assigned `title` as the document display name

### i18n

- [x] **5.11** Add i18n keys:
  - "Internal File Name" / "اسم الملف الداخلي"
  - "This name will be displayed to the customer" / "سيظهر هذا الاسم للعميل"
  - Error: "File name is required for approval" / "اسم الملف مطلوب عند الموافقة"

---

## Acceptance Criteria

- [x] Admin approval modal has a visible "Internal File Name" input field
- [x] The field is required when approving (cannot approve without entering a name)
- [x] The staff-entered name is saved to the document's `title` field in the database
- [x] In the customer portal document list, the staff-assigned `title` is shown as the document's name
- [x] The customer does NOT see the original upload filename when a title has been set by staff
- [x] The validation prevents approving without a title (both client-side and server-side)
- [x] Arabic translation is correct for the new field labels and errors

---

## Dependencies

- `app/api/admin/documents/[id]/verify/route.ts` — backend (verify title handling)
- Admin document review UI component (location to be confirmed in subtask 5.3)
- `components/portal/documents/DocumentTable.tsx` — customer portal display

---

## Edge Cases

- [x] Document was approved before this change (no title set) — customer sees original filename as fallback
- [x] Staff enters a very long file name (200+ chars) — truncate display with tooltip in portal
- [x] Staff accidentally enters the file name in Arabic but document category expects English — no restriction, accept any string
- [x] Staff edits an already-approved document's title — update should also update what the customer sees
- [x] Staff tries to approve with an empty title after this change is deployed — must be blocked

---

## Regression Requirements

Must NOT break:
- Document rejection flow (rejection does not require a title)
- Existing approved documents that have no title set (show filename as fallback)
- Admin document list display
- Document download functionality
