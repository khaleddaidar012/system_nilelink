# Task 6 — Implementation Plan

Status: completed
Priority: high

---

## Objective

Implement 10 product requirements collected in `needs.md`. The requirements span:
- Account activation flow corrections
- Notification system bug fixes
- Dark mode color palette adjustment for the public website
- Complete redesign of the document upload UI (wizard-style flow)
- Document category expansion (import card / export card distinction)
- Admin approval enhancement: staff writes a file name, customer sees it
- Authentication enhancement: support login via username OR email
- Communication channels alert in the portal sidebar + account settings
- Company phone number display: replace visible number with a contact link

---

## Requirements Summary (from needs.md)

| # | Requirement | Area |
|---|-------------|------|
| 1 | New account shows "Under Review" status; all portal services are locked until admin approves documents | Auth / Portal |
| 2 | Bug: uploading 3 documents creates 3 phantom "rejected" notifications | Notifications |
| 4 | Public website dark mode: change background from pure black/navy to a slightly lighter dark slate | UI / CSS |
| 5 | Document upload redesign: checkbox-grid to pick category then left-side vertical progress indicator | Upload UI |
| 6 | Document types: separate "Import Card" and "Export Card" as distinct options | Document Categories |
| 7 | On admin approval: staff enters internal file name displayed to customer | Admin / Documents |
| 8 | Login / Register: support both username and email as login identifier | Auth |
| 9 | Communication channels indicator in sidebar nav + alert if not fully verified + visible in customer account settings | Portal Sidebar / Settings |
| 10 | Replace the displayed company phone number (010...) with a hidden contact link | Public Website |

> Note: Requirement #3 does not appear in needs.md — numbering skips from 2 to 4. No requirement #3 exists.

---

## Task Order (Dependency-Driven)

Recommended execution sequence:

1. 06-document-categories.md        — extend document categories (foundational for upload UI)
2. 01-account-activation-status.md  — fix new account status and portal lockout
3. 02-notification-rejection-bug.md — fix phantom rejection notifications
4. 03-dark-mode-color.md            — CSS-only public site dark mode tweak
5. 07-authentication-username.md    — username support in login + register
6. 05-admin-approval-filename.md    — staff internal filename field on approval
7. 08-communication-channels.md     — sidebar indicator + settings section
8. 09-phone-to-link.md             — public site phone → link replacement
9. 04-document-upload-ux.md        — largest frontend task (depends on #6)

---

## Architecture Notes

### Stack
- Framework: Next.js App Router with TypeScript
- Database: MongoDB via Mongoose
- Auth: JWT (access + refresh tokens stored in cookies)
- Storage: Cloudflare R2 for binary files
- Styling: Tailwind CSS v4 (theme defined in globals.css via @theme)
- i18n: next-intl — Arabic (ar) + English (en) locales
- Components: /components/portal/, /components/admin/, /components/layout/

### Key Models
- User — has username?, status, emailVerified, whatsappVerified
- Customer — has accountStatus: "active" | "warning" | "inactive"
- Document — has category (free string), title, fileName, status
- Notification — has type, recipientCustomerId, targetAudience

### Key API Paths
- POST /api/auth/register — creates customer + user record
- POST /api/auth/login — accepts identifier (email or username already supported)
- POST /api/portal/documents/upload — uploads files, saves metadata, creates notifications
- POST /api/admin/documents/[id]/verify — staff approves/rejects, notifies customer
- GET /api/portal/notifications — returns customer notifications

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Notification bug fix may leave orphaned phantom notifications in DB | UX — customers see old ghost rejections | Clean phantom notifications OR filter by relatedDocumentId on fetch |
| Upload UI redesign is the largest change — affects mobile | Mobile layout may break | Test both desktop and mobile after redesign |
| Dark mode color change is global across public website | Visual regression on public pages | Adjust only dark background token or add override class |
| Username login already partially implemented in login route; register may not save username | Login by username fails | Audit register flow; ensure username is saved when provided |
| Communication channels requires verified state from session/context | Incorrect indicator state | PortalContext already exposes emailVerified + whatsappVerified — use those |

---

## Regression Risks — Must NOT Break

- [x] Existing login by email
- [x] Existing document upload (quota, R2 storage, metadata)
- [x] Existing document approval and rejection by staff
- [x] Existing account health calculation engine
- [x] Existing notification bell in portal header
- [x] Existing portal sidebar lock/unlock behavior
- [x] Existing register flow
- [x] Arabic RTL layout
- [x] Mobile bottom navigation

---

## Definition of Done

- [x] All 10 requirements implemented
- [x] All subtasks checked off in each task file
- [x] Regression list verified
- [x] Arabic and English i18n keys updated where applicable
- [x] No TypeScript errors introduced
- [x] Mobile layout tested for upload UI redesign
- [x] Notification bug: upload 3 files produces 0 phantom rejection notifications
- [x] New account: portal services locked until documents approved
