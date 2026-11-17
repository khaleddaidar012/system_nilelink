# Task: Public Website Dark Mode Color Adjustment

Status: completed
Priority: medium

---

## Objective

The public-facing website's dark mode background is currently too dark (pure black / very deep navy — `#0f172a` / `secondary-900`). The requirement is to lighten it slightly to a dark slate gray similar to the color used in chat interfaces — more like `#1e293b` or a custom slate. This makes the website feel more welcoming and readable in dark mode, less oppressively black.

---

## Background & Current State

### Current Dark Background Values (globals.css and Tailwind theme)

From `app/globals.css`:
```css
--color-secondary-900: #0f172a;  /* Currently used as the darkest dark bg */
--color-secondary-800: #1e293b;  /* Slightly lighter */
```

From `app/globals.css` body rule:
```css
body {
  @apply bg-white text-secondary-900 dark:bg-secondary-900 dark:text-secondary-100;
}
```

The public Navbar uses `dark:bg-secondary-900` and the portal layout uses `dark:bg-[#0b0f19]`.

The user wants the outer public site dark mode background to be a lighter, warmer dark — "like the chat color" — approximately the shade of `#1a2232` or `#1e2a3a`.

### Scope
- Only the **public website** outer dark background
- The **portal** has its own dark background (`#0b0f19` and `#0d1322`) which should NOT be changed
- Footer, Navbar, Hero sections, and page backgrounds on the public site

---

## Subtasks

- [x] **3.1** Identify all dark background color usages on the public website:
  - `app/globals.css` — `body` dark rule, any `@layer base` or `@layer utilities` dark rules
  - `components/layout/Navbar.tsx` — `dark:bg-secondary-900`
  - `components/layout/Footer.tsx` — dark background classes
  - Public page components in `components/sections/` — any `dark:bg-secondary-900` usage
- [x] **3.2** Decide the target dark background color:
  - Target: approximately `#1a2332` (a dark slate with a slight blue undertone — "chat-like")
  - Alternative: use `secondary-800` (`#1e293b`) if it's close enough
  - Add a new CSS custom property if needed: `--color-bg-dark-site: #1a2332`
- [x] **3.3** Update `app/globals.css`:
  - Change `dark:bg-secondary-900` in the `body` rule to the new lighter dark value
  - OR add a new custom property and use it
  - Ensure the change does NOT affect `--color-secondary-900` itself (keep the token for text and borders)
- [x] **3.4** Update `components/layout/Navbar.tsx` — replace `dark:bg-secondary-900` with the new dark background class or custom value for the navbar background
- [x] **3.5** Update `components/layout/Footer.tsx` — apply same dark background update to footer
- [x] **3.6** Scan all files in `components/sections/` for `dark:bg-secondary-900` usage and update where appropriate
- [x] **3.7** Verify the portal layout is NOT affected — `app/[locale]/portal/layout.tsx` uses `dark:bg-[#0b0f19]` which is a hardcoded value — confirm it remains unchanged
- [x] **3.8** Visual review: open the public site in dark mode and confirm the background looks like a lighter dark slate, not pure black
- [x] **3.9** Verify text contrast remains accessible (text should still be readable on the new background)

---

## Acceptance Criteria

- [x] Public website dark mode background is visibly lighter than before (dark slate, not pure black)
- [x] The new dark background matches approximately the shade described as "like the chat color"
- [x] Navbar dark background is updated consistently
- [x] Footer dark background is updated consistently
- [x] Section backgrounds on public pages are updated consistently
- [x] Portal dark background (`#0b0f19` and `#0d1322`) is completely unchanged
- [x] Text contrast on the new background is accessible (WCAG AA minimum)
- [x] Light mode is completely unaffected

---

## Dependencies

- `app/globals.css` — primary CSS file
- `components/layout/Navbar.tsx`
- `components/layout/Footer.tsx`
- `components/sections/` — all section components

---

## Edge Cases

- [ ] Some dark backgrounds may be hardcoded hex values (not Tailwind tokens) — search for `#0f172a` and `#0b0f19` in all component files
- [ ] Gradient backgrounds using `from-secondary-900` may need updating
- [ ] `dark:border-secondary-700` colors should remain unchanged (borders should not be affected)
- [ ] RTL Arabic layout should not be affected by color changes

---

## Regression Requirements

Must NOT break:
- Light mode appearance (completely unchanged)
- Portal layout dark backgrounds
- Admin panel dark backgrounds
- All text readability in dark mode
