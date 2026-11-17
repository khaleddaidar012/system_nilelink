# Task 09 — Dashboard Backups Page

## Objective

Add **Dashboard → System → Backups** (`/admin/system/backups`) listing backups with status/date/time/size/type and actions (Create, Restore, Import, Delete, Protect). Download only if explicitly approved (decision D7: disabled in v1).

## Why This Is Needed

Admins need visibility and control without server access. Must follow the existing admin design system and not redesign unrelated UI.

## Existing Project Files Involved

- `app/[locale]/admin/layout.tsx` — session + role gate (`staff`/`super_admin`); **page itself must additionally restrict to `super_admin`** (server-side check with `getServerSession()` and redirect to `/admin`).
- `app/[locale]/admin/settings/page.tsx` — structure template (`"use client"`, `AdminHeader`, `div.space-y-6.p-6.sm:p-8`).
- `components/admin/AdminHeader.tsx` — page header.
- `components/admin/AdminSidebar.tsx` — add a "System" group/entry; labels use `t("admin.sidebar.*") || fallback` and `isAr` inline fallback.
- `components/admin/settings/DocumentCategoriesManager.tsx` — largest existing admin manager (22 KB): reuse its table/modal/card styling, toasts and dark-mode classes.
- `components/ui/Button.tsx`, `components/ui/Toast.tsx` (+ `sonner` dependency) — buttons/notifications.
- `lib/utils.ts` (`cn`), `lucide-react` icons (e.g. `DatabaseBackup`, `HardDrive`, `RotateCcw`, `ShieldCheck`, `Upload`).
- `messages/{ar,en,fr,de,it,zh,bg}.json`, `add_admin_keys.js`, `add_sidebar_keys.js`, `scripts/generate-locales.mjs` — translation keys (`admin.backups.*`, `admin.sidebar.backups`).
- Style references for modals/drawers: `components/admin/invoices/EditInvoiceModal.tsx`, `InvoiceReviewDrawer.tsx`.

## New Files To Create

- `app/[locale]/admin/system/backups/page.tsx` (server wrapper: super_admin guard) 
- `components/admin/system/backups/BackupsManager.tsx` (client; list, polling, actions)
- `components/admin/system/backups/BackupStatusCard.tsx` (agent health, last backup, next scheduled run 21:00 Cairo, free disk)
- `components/admin/system/backups/BackupsTable.tsx`
- `components/admin/system/backups/CreateBackupButton.tsx` (Task 10)
- `components/admin/system/backups/RestoreDialog.tsx` (Task 11)
- `components/admin/system/backups/ImportBackupDialog.tsx` (Task 12)
- `components/admin/system/backups/JobProgress.tsx`
- `components/admin/system/backups/formatters.ts` (bytes, Cairo-time date formatting)

## Files To Modify

- `components/admin/AdminSidebar.tsx` (new nav item/group, only rendered for `super_admin` — sidebar currently has no role info; pass role from layout or fetch session)
- `app/[locale]/admin/layout.tsx` only if needed to pass the role to the sidebar (minimal change)
- `messages/*.json` (7 locales; at least `ar` and `en` complete, others via the generator script)

## UI content

- Status card: agent online/offline, last successful backup (age, color-coded if > 26 h), next scheduled run, free disk, tools version.
- Table columns: Status badge (completed/failed/running/quarantined), Date, Time (display in **Africa/Cairo**), Size, Type (Automatic/Manual/Safety/Imported), Created by, Protected, Actions.
- Filters by type/status; pagination (cursor) — default last 30.
- Actions: Create Backup, Restore (danger styling), Import, Protect/Unprotect, Delete (not for protected). Download: hidden in v1.
- Empty/error/loading/agent-offline states; RTL support (Arabic default) using existing `rtl:` classes.

## Implementation Tasks

- [ ] Add translation keys (ar/en first) and run the locale generator for others.
- [ ] Add sidebar entry "Backups" under a new "System" group (icon `DatabaseBackup`); show only to `super_admin`.
- [ ] Create server page with `getServerSession()`; redirect non-super_admin.
- [ ] Build `BackupsManager` with `fetch("/api/admin/system/backups")`, SWR-like polling every 10 s only while a job is running, 60 s otherwise.
- [ ] Build status card using `/api/admin/system/backups/health`.
- [ ] Build table with accessible markup, unique `id`s on interactive elements for tests.
- [ ] Integrate dialogs from Tasks 10–12 (placeholders until those tasks).
- [ ] Format dates with `Intl.DateTimeFormat(locale, { timeZone: "Africa/Cairo" })`.
- [ ] Add dark-mode and mobile (table → cards) styling consistent with existing pages.
- [ ] Manual UI QA in ar and en, light/dark.

## Security Requirements

- Server-side `super_admin` gate (not only hiding links).
- Never render agent URL, filesystem paths, or secrets; show IDs and metadata only.
- Escape all metadata strings (React default); `importedFrom.originalFileName` treated as untrusted text.

## Error Handling

- Agent offline → status card shows offline + disables create/restore/import with explanation.
- API errors → toast with safe message and request id.
- Session expiry (401) → redirect to `/login?callbackUrl=/admin/system/backups`.

## Testing

- Component tests for table states; e2e (Playwright — `.playwright-mcp` exists) for super_admin vs staff access.

## Acceptance Criteria

- [ ] Page reachable only by `super_admin`; staff redirected.
- [ ] List shows accurate data from agent in Cairo time.
- [ ] Matches existing admin look (light/dark, RTL).
- [ ] All new strings translated at least in `ar` and `en`.

## Depends On

- 08

## Blocks

- 10, 11, 12, 20
