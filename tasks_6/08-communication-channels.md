# Task: Communication Channels Indicator in Sidebar & Settings

Status: completed
Priority: medium

---

## Objective

1. Add a "Communication Channels" item to the portal sidebar navigation that:
   - Shows a flashing/pulsing alert badge if the user has NOT verified at least one communication channel (email OR WhatsApp)
   - Shows a normal indicator if at least one channel is verified
   - If ALL channels are verified, shows no alert badge

2. Make the communication channels section visible in the customer's account settings page (portal profile page)

---

## Background & Current State

### Verified Channels Available in Context
File: `components/portal/PortalContext.tsx`

The portal context exposes `user` object which contains:
- `user.emailVerified: boolean`
- `user.whatsappVerified: boolean`

These are set from the session JWT and are already available in the sidebar component.

### Current Sidebar
File: `components/portal/PortalSidebar.tsx`

The sidebar has these nav items:
- Dashboard
- Documents & Legal
- Service Requests
- Quotes
- Financials & Invoices
- Notifications (with unread badge)
- Company Profile

There is NO "Communication Channels" item currently.

### Portal Profile Page
File: `app/[locale]/portal/profile/page.tsx`

The profile page has tabs: "corporate", "security", "compliance". It shows email, phone, WhatsApp verified fields. Communication channels may be partially visible in the "security" tab but need to be surfaced more prominently.

### User Requirement
- Communication channels section should appear in the sidebar nav
- If not verified: show a flashing/pulsing alert indicator (badge or icon)
- "If even ONE channel is verified, do NOT show the alert" — alert only when ZERO channels are verified
- Also show the communication channels section in the customer account settings (profile page)

---

## Subtasks

### Sidebar Navigation

- [x] **8.1** Add a new nav item to `components/portal/PortalSidebar.tsx`:
  - Label: "Communication Channels" / "قنوات الاتصال"
  - Icon: Use `MessageSquare` or `Radio` from lucide-react
  - Link: `/portal/profile` with a tab query param, OR a dedicated `/portal/channels` page (see 8.2)
  - Determine the best linking strategy

- [x] **8.2** Decide routing for the communication channels section:
  - Option A: Link to `/portal/profile?tab=channels` (simpler, uses existing profile page)
  - Option B: Create a new dedicated page `/portal/channels/page.tsx` (cleaner separation)
  - **Recommendation**: Option A — link to profile page with a specific tab, add a "channels" tab

- [x] **8.3** Implement the alert badge logic on the new sidebar nav item:
  - Read `user.emailVerified` and `user.whatsappVerified` from `usePortal()` context
  - Compute `hasAnyVerifiedChannel = user.emailVerified || user.whatsappVerified`
  - If `!hasAnyVerifiedChannel`: show a pulsing/flashing red or amber badge on the nav item
  - If `hasAnyVerifiedChannel` (at least one verified): show NO alert badge
  - Badge design: small colored dot or "!" icon with `animate-pulse` class

- [x] **8.4** Apply the `isUnverified` lockout correctly:
  - If `user.emailVerified === false` (email not verified), the sidebar already locks all items
  - The "Communication Channels" item should STILL be accessible even when email is not verified (so the user can go verify their channels)
  - Exclude the communication channels nav item from the lock behavior

### Portal Profile Page — Channels Tab/Section

- [x] **8.5** Read `app/[locale]/portal/profile/page.tsx` to understand the current tab structure and where email/WhatsApp verification is shown

- [x] **8.6** Add or surface a dedicated "Communication Channels" tab or section in the profile page:
  - Show: Email address + verified status (green check or red X)
  - Show: WhatsApp number + verified status (green check or red X)
  - Provide action buttons: "Verify Email" / "Verify WhatsApp"
  - If already verified, show "Verified ✓" with a green badge

- [x] **8.7** Ensure the profile page can receive a `tab=channels` query parameter from the URL and auto-scroll to or activate the channels section

- [x] **8.8** Link the "Verify Email" button to the existing email verification flow

- [x] **8.9** Link the "Verify WhatsApp" button to the existing WhatsApp verification flow

### Alert Badge Design

- [x] **8.10** Design the alert badge for the sidebar nav item:
  - When NO channels verified: use a small animated pulsing dot (e.g., `animate-pulse`, amber or red)
  - Position: top-right corner of the nav item icon OR as a count badge after the label
  - The badge should not be confusable with the notification count badge

- [x] **8.11** Ensure the badge respects the collapsed sidebar state:
  - When collapsed: show badge on the icon only
  - When expanded: show badge after the label text

### i18n

- [x] **8.12** Add i18n keys:
  - `"portal.sidebar.channels"`: `"Communication Channels"` / `"قنوات الاتصال"`
  - `"portal.channels.email"`: `"Email"` / `"البريد الإلكتروني"`
  - `"portal.channels.whatsapp"`: `"WhatsApp"`
  - `"portal.channels.verified"`: `"Verified"` / `"موثق"`
  - `"portal.channels.notVerified"`: `"Not Verified"` / `"غير موثق"`
  - `"portal.channels.verifyNow"`: `"Verify Now"` / `"وثّق الآن"`
  - `"portal.channels.alertBadge"`: `"Action required"` / `"مطلوب اتخاذ إجراء"`

---

## Acceptance Criteria

- [x] "Communication Channels" item appears in the portal sidebar navigation
- [x] A pulsing/flashing alert indicator appears on the sidebar item when ZERO channels are verified
- [x] When at least ONE channel is verified (email OR WhatsApp), the alert badge disappears
- [x] The communication channels sidebar item is accessible even when the account is in an unverified/locked state
- [x] Clicking the sidebar item navigates to the communication channels section in the profile page
- [x] The profile page clearly shows the verification status of email and WhatsApp
- [x] "Verify" action buttons are present for unverified channels
- [x] Arabic RTL layout is correct for all new sidebar and profile UI
- [x] Collapsed sidebar still shows the alert badge on the icon

---

## Dependencies

- `components/portal/PortalSidebar.tsx` — add nav item + badge logic
- `components/portal/PortalContext.tsx` — provides `user.emailVerified` + `user.whatsappVerified`
- `app/[locale]/portal/profile/page.tsx` — add channels tab/section
- `messages/ar.json`, `messages/en.json` — i18n keys

---

## Edge Cases

- [x] Both email AND WhatsApp already verified → no alert badge shown at all
- [x] Email verified, WhatsApp not → no alert badge (at least one is verified)
- [x] Neither verified → pulsing alert badge shown
- [x] Context hasn't loaded yet (loading state) → no badge (treat as unknown, don't flash prematurely)
- [x] User verifies WhatsApp in another tab → badge should disappear on next navigation or context refresh

---

## Regression Requirements

Must NOT break:
- Existing sidebar navigation items
- Existing email verification flow
- Existing WhatsApp verification flow
- Existing profile page tabs (corporate, security, compliance)
- Collapsed sidebar behavior
- Mobile bottom navigation (does NOT need to include channels separately — profile link covers it)
