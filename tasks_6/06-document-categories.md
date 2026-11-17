# Task: Document Categories — Import Card & Export Card

Status: completed
Priority: high

---

## Objective

Add "Import Card" (بطاقة استيرادية) and "Export Card" (بطاقة تصديرية) as distinct, separate document category options. Currently these may be combined or missing. They must appear as separate selectable categories in the upload UI, admin review panel, and all category filter dropdowns.

---

## Background & Current State

### Current Document Categories

From `components/portal/documents/MultiFileUploadZone.tsx`:
```ts
export type DocumentCategory =
  | "commercial_register"
  | "tax_card"
  | "import_card"
  | "export_card"
  | "license"
  | "customs_certificate"
  | "contract"
  | "other"
  | string
```

### Dynamic Categories System

The system also supports dynamic categories fetched from:
`/api/settings/document-categories`

This API returns categories from `SystemSetting` model or a hardcoded fallback. Both must be updated.

---

## Subtasks

### Backend / Data Layer

- [x] **6.1** Locate the dynamic document categories API:
  - Find `app/api/settings/document-categories/route.ts`
  - Read the full implementation to understand where categories are defined

- [x] **6.2** Add `"import_card"` and `"export_card"` to the categories list returned by the API:
  - Each category must have: `key`, `nameEn`, `nameAr`
  - `{ key: "import_card", nameEn: "Import Card", nameAr: "بطاقة استيرادية" }`
  - `{ key: "export_card", nameEn: "Export Card", nameAr: "بطاقة تصديرية" }`
  - Insert them in a logical position (e.g., after `"tax_card"`, before `"license"`)

- [x] **6.3** If categories are stored in the `SystemSetting` MongoDB collection:
  - Add a migration script in `scripts/` to insert the new categories into the database
  - OR update the seed/default data so the categories are created automatically

- [x] **6.4** If categories are hardcoded in the API route:
  - Add the two new categories directly to the hardcoded array

### Frontend — Upload Component

- [x] **6.5** Update the `DocumentCategory` type in `components/portal/documents/MultiFileUploadZone.tsx`:
  ```ts
  export type DocumentCategory =
    | "commercial_register"
    | "tax_card"
    | "import_card"    // ← new
    | "export_card"    // ← new
    | "license"
    | "customs_certificate"
    | "contract"
    | "other"
    | string
  ```

- [x] **6.6** Update the fallback hardcoded category list in `MultiFileUploadZone.tsx` (used if API fails) to include both new categories

- [x] **6.7** Update the new upload wizard (from `04-document-upload-ux.md`) — ensure the CategorySelectionGrid includes both new categories as cards

### Admin Panel

- [x] **6.8** Locate the admin document review and document filter UI:
  - `app/[locale]/admin/documents/` pages
  - Any dropdown or filter for `category` in admin views
- [x] **6.9** Ensure `"import_card"` and `"export_card"` appear as selectable filter options in the admin document list
- [x] **6.10** Ensure the admin document review modal/panel shows the correct category name (Arabic + English) for these two new types

### i18n

- [x] **6.11** Add i18n keys to `messages/ar.json`:
  - `"documents.category.import_card"`: `"بطاقة استيرادية"`
  - `"documents.category.export_card"`: `"بطاقة تصديرية"`

- [x] **6.12** Add i18n keys to `messages/en.json`:
  - `"documents.category.import_card"`: `"Import Card"`
  - `"documents.category.export_card"`: `"Export Card"`

---

## Acceptance Criteria

- [x] "Import Card" (بطاقة استيرادية) appears as a distinct selectable option in the document upload UI
- [x] "Export Card" (بطاقة تصديرية) appears as a distinct selectable option in the document upload UI
- [x] Both categories appear in admin document filter dropdowns
- [x] Both categories display their correct Arabic and English names throughout the system
- [x] The API `/api/settings/document-categories` returns both new categories
- [x] Documents uploaded with `"import_card"` or `"export_card"` category are saved correctly to MongoDB
- [x] Existing documents with other categories are completely unaffected

---

## Dependencies

- `app/api/settings/document-categories/route.ts`
- `components/portal/documents/MultiFileUploadZone.tsx`
- `04-document-upload-ux.md` (new upload wizard also needs these categories)
- `messages/ar.json`, `messages/en.json`

---

## Edge Cases

- [ ] If categories are stored in MongoDB, and the DB does not yet have the new categories, the API must fall back gracefully to a hardcoded list including the new categories
- [ ] Existing documents with `category: "other"` that were actually import/export cards — no auto-migration needed (manual admin correction)
- [ ] Category grid in upload wizard must handle more categories gracefully (responsive wrap)

---

## Regression Requirements

Must NOT break:
- Existing document categories (commercial_register, tax_card, license, etc.)
- Existing documents with those categories
- Admin document filters
- Dynamic categories API endpoint
