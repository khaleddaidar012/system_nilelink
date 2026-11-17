# Task: Document Upload UX Redesign (Wizard Flow)

Status: completed
Priority: high

---

## Objective

Redesign the document upload interface from the current drag-and-drop + category dropdown approach to a structured wizard-like two-panel flow:

1. **Right Panel** — A grid of document type boxes (one per document category). Customer clicks/checks boxes for the document types they want to upload.
2. **Left Panel (Progress Column)** — A vertical list showing each selected document type with its upload status indicator: pending → uploading (green spinner) → done (green checkmark).

This mirrors the "Nafeza" (Egyptian customs system) upload experience the user references.

---

## Background & Current State

### Current Upload Component
File: `components/portal/documents/MultiFileUploadZone.tsx`

Currently:
- Drag-and-drop zone to add files
- Dropdown to assign category per file
- Upload all button
- Progress bar per file in a list

### New UX Flow (Wizard Pattern)

**Step 1 — Category Selection Grid:**
- Display all available document categories as clickable boxes/cards
- Each box shows the category name (in both Arabic and English)
- Customer checks/clicks the categories they have files for
- Selected categories get a green checkmark overlay

**Step 2 — Upload Phase:**
- After selecting categories, left panel shows a vertical progress list
- Each selected category = one row with: category name, status indicator
- Status indicator starts as a green circle (pending/ready)
- When uploading: spinning green indicator
- When done: green checkmark + "Uploaded" text
- Upload happens one category/file at a time, sequentially from top to bottom
- Customer attaches a file to each selected category row (or files are picked upfront)

**Design Reference:** "زي نظام نافذة بالظبط" — mirrors the Nafeza customs document portal UX

---

## Dependencies

- Requires `06-document-categories.md` to be completed first (so import card / export card exist as categories)
- `app/api/portal/documents/upload/route.ts` — upload API (should remain unchanged)
- `app/api/settings/document-categories/route.ts` — dynamic categories API

---

## Subtasks

### Phase 1 — Category Selection Grid

- [x] **4.1** Create a new component: `components/portal/documents/CategorySelectionGrid.tsx`
  - Renders all document categories as a responsive grid of clickable cards
  - Each card shows: icon (based on category type), category name in Arabic + English
  - On click/select: card gets a green checkmark border and checkmark icon overlay
  - Multiple categories can be selected simultaneously
  - "Start Upload" button appears after at least one category is selected

- [x] **4.2** Fetch categories from `/api/settings/document-categories` for dynamic category support
  - Fall back to hardcoded list if API fails
  - Categories must include: `commercial_register`, `tax_card`, `import_card`, `export_card`, `license`, `customs_certificate`, `contract`, `other`

- [x] **4.3** Show the count of selected categories and a "Start Upload →" CTA button below the grid

### Phase 2 — Upload Progress Column (Left Panel)

- [x] **4.4** Create a new component: `components/portal/documents/UploadProgressColumn.tsx`
  - Renders a vertical list of selected document categories
  - Each row: category icon + name, file picker button (or file already attached), status indicator
  - Status indicator states:
    - `pending`: gray or blue circle
    - `active`: animated green spinner (Loader2 icon spinning, green color)
    - `done`: green solid circle with white checkmark (CheckCircle2)
    - `error`: red X circle with error message

- [x] **4.5** Implement sequential upload logic:
  - When "Begin Upload" button is clicked:
    - First row becomes `active` state
    - Upload its file to `/api/portal/documents/upload`
    - On success: row transitions to `done`, next row becomes `active`
    - On failure: row transitions to `error`, ask user to retry that file
    - Continue until all rows are processed

- [x] **4.6** Implement file attachment per category row:
  - Each row has a hidden file input
  - "Attach File" button or drag-over zone per row
  - Accepted types: PDF, JPEG, PNG, WEBP (max 10MB per file)
  - Show attached filename preview in the row

### Phase 3 — Layout Assembly

- [x] **4.7** Update `components/portal/documents/MultiFileUploadZone.tsx` OR create a new wrapper component `DocumentUploadWizard.tsx`:
  - Step 1: CategorySelectionGrid (right area or full width on mobile)
  - Step 2: UploadProgressColumn (left panel) + summary on right
  - Handle step transitions with animation (framer-motion fade/slide)

- [x] **4.8** Update the portal documents page `app/[locale]/portal/documents/page.tsx` to use the new wizard component instead of the old `MultiFileUploadZone`

- [x] **4.9** Mobile layout:
  - On mobile: steps are vertical — category grid first (full width), then progress column (full width)
  - No side-by-side layout on mobile screens (< 768px)
  - Touch-friendly card sizes (min 44px touch targets)

### Phase 4 — Polish

- [x] **4.10** Add animations:
  - Category cards: subtle scale up on selection, checkmark fade-in
  - Progress column rows: slide-in when step 2 is entered
  - Status indicators: smooth transition between states

- [x] **4.11** Add i18n keys for all new UI text in `messages/ar.json` and `messages/en.json`:
  - "Select document types" / "اختر أنواع المستندات"
  - "Start Upload" / "بدء الرفع"
  - "Uploading..." / "جاري الرفع..."
  - "Uploaded" / "تم الرفع"
  - "Attach file" / "إرفاق ملف"
  - "Upload complete" / "اكتمل الرفع"

- [x] **4.12** Empty state: if no categories are available (API fails), show a fallback message

- [x] **4.13** Error state: if upload fails for a file, show inline error on the row with a retry button

---

## Acceptance Criteria

- [x] Customer sees a grid of document type cards to select from
- [x] Selecting a category card shows a visible checkmark indicator on it
- [x] At least one category must be selected before proceeding to upload
- [x] Each selected category has its own upload row in the progress column
- [x] Files upload sequentially (one at a time), not all at once
- [x] Status indicators show correct state: pending, uploading (animated), done, error
- [x] Mobile layout is fully functional and does not overlap panels
- [x] Arabic RTL layout is correct for all new components
- [x] Old drag-and-drop behavior is replaced (not just added alongside)
- [x] Quota check still works (upload is blocked if document limit exceeded)
- [x] File type and size validation still works per file

---

## Edge Cases

- [ ] Customer selects 5 categories but only attaches files for 3 — warn about missing files before upload begins
- [ ] Upload fails mid-way (3 of 5 done) — remaining rows stay pending, failed row shows retry
- [ ] Very long category names in Arabic — truncate with ellipsis in cards
- [ ] Customer hits quota limit mid-upload (e.g., 5 slots left but selected 8 categories) — show clear quota error after the 5th succeeds
- [ ] Customer deselects all categories and tries to proceed — prevent and show validation message
- [ ] Network error during upload — detect, show row-level error, do not retry silently

---

## Regression Requirements

Must NOT break:
- Upload API (`/api/portal/documents/upload`) — no backend changes
- Document list page display after upload completes
- Quota enforcement
- File type and size limits
- Mobile bottom navigation
